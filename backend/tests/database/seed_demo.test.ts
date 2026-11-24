import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize, UniqueConstraintError } from 'sequelize';
import { createDatabase, readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { seedDemo } from '../../src/database/seeders/demo.ts';
import { defineModels } from '../../src/models/index.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const databaseUrl = readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL });
const adminDatabase = createDatabase(databaseUrl);
const schema = `seed_test_${randomUUID().replaceAll('-', '')}`;
const database = new Sequelize(databaseUrl, {
  logging: false,
  dialectOptions: { options: `-c search_path=${schema},public` },
});
let schemaCreated = false;
const {
  Usuario, Rol, Paciente, Profesional, Turno, FichaClinica, NotaClinica, HorarioAtencion, BloqueoAgenda,
  Notificacion, TokenRecuperacion, EventoVisita,
} = defineModels(database);

before(async () => {
  await runMigrations(adminDatabase);
  await adminDatabase.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  await adminDatabase.query(
    `CREATE TABLE "${schema}".schema_migrations (nombre varchar(255) PRIMARY KEY, ejecutada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  await adminDatabase.query(
    `CREATE TABLE "${schema}".schema_seeds (nombre varchar(255) PRIMARY KEY, ejecutada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  await runMigrations(database);
});

after(async () => {
  try {
    await database.close();
    if (schemaCreated) {
      await adminDatabase.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  } finally {
    await adminDatabase.close();
  }
});

test('el seed crea datos relacionados y no modifica ni duplica al repetirse', async () => {
  const transaction = await database.transaction();
  try {
    assert.equal(await seedDemo(database, transaction), true);
    const patientUser = await Usuario.findOne({
      where: { email: 'paciente@ejemplo.invalid' },
      include: [{ model: Rol, as: 'roles', where: { codigo: 'paciente' } }],
      transaction,
    });
    const professionalUser = await Usuario.findOne({
      where: { email: 'profesional@ejemplo.invalid' },
      include: [{ model: Rol, as: 'roles', where: { codigo: 'profesional' } }],
      transaction,
    });
    const adminUser = await Usuario.findOne({
      where: { email: 'admin@ejemplo.invalid' },
      include: [{ model: Rol, as: 'roles', where: { codigo: 'administrador' } }],
      transaction,
    });
    assert.ok(patientUser && professionalUser && adminUser);
    for (const user of [patientUser, professionalUser, adminUser]) {
      assert.equal(user.estado, 'inactivo');
      assert.equal(user.password_hash, '!demo-sin-acceso!');
    }
    const patient = await Paciente.findOne({ where: { usuario_id: patientUser.id }, transaction });
    const professional = await Profesional.findOne({ where: { usuario_id: professionalUser.id }, transaction });
    assert.ok(patient && professional);
    assert.equal(professional.visible, false);
    const ficha = await FichaClinica.findOne({
      where: { paciente_id: patient.id, profesional_id: professional.id }, transaction,
    });
    const turno = await Turno.findOne({
      where: { paciente_id: patient.id, profesional_id: professional.id, estado: 'atendido' }, transaction,
    });
    assert.ok(ficha && turno);
    assert.ok(await NotaClinica.findOne({
      where: { ficha_id: ficha.id, turno_id: turno.id, paciente_id: patient.id, profesional_id: professional.id },
      transaction,
    }));
    assert.equal(await HorarioAtencion.count({ where: { profesional_id: professional.id }, transaction }), 1);
    assert.equal(await BloqueoAgenda.count({ where: { profesional_id: professional.id }, transaction }), 1);
    assert.equal(await Notificacion.count({ where: { turno_id: turno.id }, transaction }), 0);
    assert.equal(await TokenRecuperacion.count({ where: { usuario_id: patientUser.id }, transaction }), 0);
    assert.equal(await EventoVisita.count({ where: { profesional_id: professional.id }, transaction }), 0);

    await patientUser.update({ nombre: 'Cambio conservado' }, { transaction });
    assert.equal(await seedDemo(database, transaction), false);
    assert.equal((await patientUser.reload({ transaction })).nombre, 'Cambio conservado');
    assert.equal(await NotaClinica.count({ where: { ficha_id: ficha.id }, transaction }), 1);
    assert.equal(await Turno.count({ where: { paciente_id: patient.id, profesional_id: professional.id }, transaction }), 1);
  } finally {
    await transaction.rollback();
  }
});

test('un conflicto revierte toda la carga sin modificar el registro existente', async () => {
  const transaction = await database.transaction();
  try {
    const existing = await Usuario.create({
      nombre: 'Existente', apellido: 'Prueba', email: 'profesional@ejemplo.invalid', password_hash: 'hash-ficticio',
    }, { transaction });
    await assert.rejects(database.transaction({ transaction }, (savepoint) => seedDemo(database, savepoint)), UniqueConstraintError);
    assert.equal(await Usuario.count({ where: { email: 'paciente@ejemplo.invalid' }, transaction }), 0);
    assert.equal(await Usuario.count({ where: { email: 'admin@ejemplo.invalid' }, transaction }), 0);
    assert.equal((await existing.reload({ transaction })).nombre, 'Existente');
  } finally {
    await transaction.rollback();
  }
});
