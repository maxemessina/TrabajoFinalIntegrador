import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseError, ForeignKeyConstraintError, UniqueConstraintError } from 'sequelize';
import type { Transaction } from 'sequelize';
import { createDatabase, readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { defineModels } from '../../src/models/index.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const database = createDatabase(readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL }));
const { Usuario, Zona, Especialidad, Profesional, ProfesionalEspecialidad, TrabajoProfesional } = defineModels(database);
const profileData = { matricula: 'TEST-123', direccion_atencion: 'Direccion ficticia', duracion_consulta_min: 30 };

before(async () => {
  await runMigrations(database);
});

after(async () => {
  await database.close();
});

async function createFixture(transaction: Transaction) {
  const user = await Usuario.create({
    nombre: 'Ana', apellido: 'Ejemplo', email: 'profesional@example.invalid', password_hash: 'hash-ficticio',
  }, { transaction });
  const zone = await Zona.create({ nombre: 'Zona profesional test', provincia: 'Provincia test' }, { transaction });
  const professional = await Profesional.create({
    ...profileData, usuario_id: user.id, zona_id: zone.id,
  }, { transaction });
  return { user, zone, professional };
}

test('el profesional se relaciona con usuario, zona, especialidades y trabajos', async () => {
  const transaction = await database.transaction();
  try {
    const { user, zone, professional } = await createFixture(transaction);
    assert.equal(professional.visible, false);
    assert.equal(professional.zona_horaria, 'America/Argentina/Buenos_Aires');
    const specialties = await Especialidad.bulkCreate([
      { nombre: 'Especialidad profesional test 1' }, { nombre: 'Especialidad profesional test 2' },
    ], { transaction });
    await ProfesionalEspecialidad.bulkCreate(specialties.map((specialty) => ({
      profesional_id: professional.id, especialidad_id: specialty.id,
    })), { transaction });
    const work = await TrabajoProfesional.create({ profesional_id: professional.id, titulo: 'Trabajo ficticio' }, { transaction });
    assert.equal(work.visible, false);
    const result = await Profesional.findOne({
      where: { id: professional.id },
      include: [
        { model: Usuario, as: 'usuario', where: { id: user.id } },
        { model: Zona, as: 'zona', where: { id: zone.id } },
        { model: Especialidad, as: 'especialidades', through: { attributes: [] } },
        { model: TrabajoProfesional, as: 'trabajos', where: { id: work.id } },
      ],
      transaction,
    });
    assert.ok(result);
    const linkedSpecialties = await Especialidad.findAll({
      include: [{ model: Profesional, as: 'profesionales', where: { id: professional.id }, through: { attributes: [] } }],
      transaction,
    });
    assert.equal(linkedSpecialties.length, 2);
  } finally {
    await transaction.rollback();
  }
});

for (const duplicate of ['usuario', 'matricula'] as const) {
  test(`el profesional no puede repetir ${duplicate}`, async () => {
    const transaction = await database.transaction();
    try {
      const { user, zone } = await createFixture(transaction);
      const other = await Usuario.create({
        nombre: 'Luis', apellido: 'Ejemplo', email: 'otro-profesional@example.invalid', password_hash: 'hash-ficticio',
      }, { transaction });
      await assert.rejects(Profesional.create({
        ...profileData,
        usuario_id: duplicate === 'usuario' ? user.id : other.id,
        matricula: duplicate === 'usuario' ? 'TEST-OTRA' : profileData.matricula,
        zona_id: zone.id,
      }, { transaction }), UniqueConstraintError);
    } finally {
      await transaction.rollback();
    }
  });
}

test('la duración de consulta debe ser positiva', async () => {
  const transaction = await database.transaction();
  try {
    const { professional } = await createFixture(transaction);
    await assert.rejects(
      professional.update({ duracion_consulta_min: 0 }, { transaction }),
      (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === '23514',
    );
  } finally {
    await transaction.rollback();
  }
});

test('no se puede asignar dos veces la misma especialidad', async () => {
  const transaction = await database.transaction();
  try {
    const { professional } = await createFixture(transaction);
    const specialty = await Especialidad.create({ nombre: 'Especialidad profesional test' }, { transaction });
    const assignment = { profesional_id: professional.id, especialidad_id: specialty.id };
    await ProfesionalEspecialidad.create(assignment, { transaction });
    await assert.rejects(ProfesionalEspecialidad.create(assignment, { transaction }), UniqueConstraintError);
  } finally {
    await transaction.rollback();
  }
});

test('un perfil requiere una zona existente', async () => {
  const transaction = await database.transaction();
  try {
    const { professional } = await createFixture(transaction);
    await assert.rejects(
      professional.update({ zona_id: '11111111-1111-4111-8111-111111111111' }, { transaction }),
      ForeignKeyConstraintError,
    );
  } finally {
    await transaction.rollback();
  }
});

test('una asignación requiere una especialidad existente', async () => {
  const transaction = await database.transaction();
  try {
    const { professional } = await createFixture(transaction);
    await assert.rejects(ProfesionalEspecialidad.create({
      profesional_id: professional.id, especialidad_id: '11111111-1111-4111-8111-111111111111',
    }, { transaction }), ForeignKeyConstraintError);
  } finally {
    await transaction.rollback();
  }
});

for (const target of ['zona', 'profesional', 'especialidad'] as const) {
  test(`no puede borrarse físicamente ${target} con referencias`, async () => {
    const transaction = await database.transaction();
    try {
      const { zone, professional } = await createFixture(transaction);
      await TrabajoProfesional.create({ profesional_id: professional.id, titulo: 'Trabajo ficticio' }, { transaction });
      const specialty = await Especialidad.create({ nombre: 'Especialidad profesional test' }, { transaction });
      await ProfesionalEspecialidad.create({ profesional_id: professional.id, especialidad_id: specialty.id }, { transaction });
      let deletion: Promise<number>;
      if (target === 'zona') {
        deletion = Zona.destroy({ where: { id: zone.id }, transaction });
      } else if (target === 'profesional') {
        deletion = Profesional.destroy({ where: { id: professional.id }, transaction });
      } else {
        deletion = Especialidad.destroy({ where: { id: specialty.id }, transaction });
      }
      await assert.rejects(
        deletion,
        (error: unknown) => error instanceof DatabaseError &&
          typeof error.parent === 'object' && 'code' in error.parent &&
          (error.parent.code === '23001' || error.parent.code === '23503'),
      );
    } finally {
      await transaction.rollback();
    }
  });
}
