import { randomUUID } from 'node:crypto';
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
const { Usuario, Zona, Paciente, Profesional, Turno, Notificacion } = defineModels(database);
const scheduled = new Date('2026-01-01T10:00:00Z');
const notification = {
  turno_version: 1, tipo: 'confirmacion_paciente' as const, estado: 'pendiente' as const, programada_para: scheduled,
};

before(async () => {
  await runMigrations(database);
});

after(async () => {
  await database.close();
});

async function createTurno(transaction: Transaction) {
  const suffix = randomUUID();
  const user = await Usuario.create({
    nombre: 'Ana', apellido: 'Ejemplo', email: `notificaciones-${suffix}@example.invalid`, password_hash: 'hash-ficticio',
  }, { transaction });
  const zone = await Zona.create({ nombre: `Zona ${suffix}`, provincia: 'Provincia test' }, { transaction });
  const patient = await Paciente.create({ usuario_id: user.id }, { transaction });
  const professional = await Profesional.create({
    usuario_id: user.id, zona_id: zone.id, matricula: `NOTIF-${suffix}`,
    direccion_atencion: 'Direccion ficticia', duracion_consulta_min: 30,
  }, { transaction });
  return Turno.create({
    paciente_id: patient.id, profesional_id: professional.id,
    inicio: scheduled, fin: new Date('2026-01-01T11:00:00Z'),
  }, { transaction });
}

function isCheckError(error: unknown): boolean {
  return error instanceof DatabaseError &&
    typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === '23514';
}

test('una notificación se asocia a su turno y admite versiones y tipos distintos', async () => {
  const transaction = await database.transaction();
  try {
    const appointment = await createTurno(transaction);
    const first = await Notificacion.create({ ...notification, turno_id: appointment.id }, { transaction });
    await Notificacion.create({
      ...notification, turno_id: appointment.id, tipo: 'recordatorio_paciente',
    }, { transaction });
    await Notificacion.create({ ...notification, turno_id: appointment.id, turno_version: 2 }, { transaction });
    const sent = await Notificacion.create({
      ...notification, turno_id: appointment.id, tipo: 'resumen_profesional', estado: 'enviada', enviada_en: scheduled,
    }, { transaction });
    assert.equal(first.intentos, 0);
    assert.equal(first.enviada_en, null);
    assert.equal(first.ultimo_error, null);
    assert.equal(sent.enviada_en?.toISOString(), scheduled.toISOString());
    const linked = await Notificacion.findOne({
      where: { id: first.id }, include: [{ model: Turno, as: 'turno', where: { id: appointment.id } }], transaction,
    });
    assert.ok(linked);
  } finally {
    await transaction.rollback();
  }
});

test('no se duplica una notificación del mismo turno, versión y tipo', async () => {
  const transaction = await database.transaction();
  try {
    const appointment = await createTurno(transaction);
    const data = { ...notification, turno_id: appointment.id };
    await Notificacion.create(data, { transaction });
    await assert.rejects(Notificacion.create(data, { transaction }), UniqueConstraintError);
  } finally {
    await transaction.rollback();
  }
});

for (const changes of [{ turno_version: 0 }, { intentos: -1 }, { estado: 'enviada' as const }]) {
  test(`se rechazan datos de notificación inválidos: ${JSON.stringify(changes)}`, async () => {
    const transaction = await database.transaction();
    try {
      const appointment = await createTurno(transaction);
      await assert.rejects(Notificacion.create({
        ...notification, ...changes, turno_id: appointment.id,
      }, { transaction }), isCheckError);
    } finally {
      await transaction.rollback();
    }
  });
}

for (const values of [
  { tipo: 'desconocido', estado: 'pendiente' },
  { tipo: 'confirmacion_paciente', estado: 'desconocido' },
]) {
  test(`la base rechaza tipos y estados desconocidos: ${JSON.stringify(values)}`, async () => {
    const transaction = await database.transaction();
    try {
      const appointment = await createTurno(transaction);
      await assert.rejects(database.query(
        'INSERT INTO notificaciones (turno_id, turno_version, tipo, estado, programada_para) VALUES ($1, $2, $3, $4, $5)',
        { bind: [appointment.id, 1, values.tipo, values.estado, scheduled], transaction },
      ), isCheckError);
    } finally {
      await transaction.rollback();
    }
  });
}

test('la notificación requiere un turno existente', async () => {
  const transaction = await database.transaction();
  try {
    await assert.rejects(Notificacion.create({
      ...notification, turno_id: '11111111-1111-4111-8111-111111111111',
    }, { transaction }), ForeignKeyConstraintError);
  } finally {
    await transaction.rollback();
  }
});

test('no se elimina físicamente un turno con notificaciones', async () => {
  const transaction = await database.transaction();
  try {
    const appointment = await createTurno(transaction);
    await Notificacion.create({ ...notification, turno_id: appointment.id }, { transaction });
    await assert.rejects(
      Turno.destroy({ where: { id: appointment.id }, transaction }),
      (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent &&
        (error.parent.code === '23001' || error.parent.code === '23503'),
    );
  } finally {
    await transaction.rollback();
  }
});
