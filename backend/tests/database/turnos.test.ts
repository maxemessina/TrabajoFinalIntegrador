import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseError, ForeignKeyConstraintError, QueryTypes } from 'sequelize';
import type { Transaction } from 'sequelize';
import { createDatabase, readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { defineModels } from '../../src/models/index.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const database = createDatabase(readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL }));
const { Usuario, Zona, Paciente, Profesional, Turno } = defineModels(database);
const start = new Date('2026-01-01T10:00:00Z');
const end = new Date('2026-01-01T11:00:00Z');

before(async () => {
  await runMigrations(database);
});

after(async () => {
  await database.close();
});

async function createFixture(transaction: Transaction) {
  const suffix = randomUUID();
  const user = await Usuario.create({
    nombre: 'Ana', apellido: 'Ejemplo', email: `turnos-${suffix}@example.invalid`, password_hash: 'hash-ficticio',
  }, { transaction });
  const zone = await Zona.create({ nombre: `Zona ${suffix}`, provincia: 'Provincia test' }, { transaction });
  const patient = await Paciente.create({ usuario_id: user.id }, { transaction });
  const professional = await Profesional.create({
    usuario_id: user.id, zona_id: zone.id, matricula: `TURNO-${suffix}`,
    direccion_atencion: 'Direccion ficticia', duracion_consulta_min: 30,
  }, { transaction });
  return { user, zone, patient, professional };
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof DatabaseError &&
    typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === code;
}

test('el turno tiene titulares, valores iniciales y admite intervalos contiguos', async () => {
  const transaction = await database.transaction();
  try {
    const { patient, professional } = await createFixture(transaction);
    const first = await Turno.create({ paciente_id: patient.id, profesional_id: professional.id, inicio: start, fin: end }, { transaction });
    await Turno.create({
      paciente_id: patient.id, profesional_id: professional.id,
      inicio: end, fin: new Date('2026-01-01T12:00:00Z'),
    }, { transaction });
    assert.equal(first.estado, 'reservado');
    assert.equal(first.version, 1);
    assert.equal(first.cancelado_en, null);
    const linked = await Turno.findOne({
      where: { id: first.id },
      include: [
        { model: Paciente, as: 'paciente', where: { id: patient.id } },
        { model: Profesional, as: 'profesional', where: { id: professional.id } },
      ],
      transaction,
    });
    assert.ok(linked);
  } finally {
    await transaction.rollback();
  }
});

test('turnos solapados solo están permitidos si no son reservados o son de otro profesional', async () => {
  const transaction = await database.transaction();
  try {
    const first = await createFixture(transaction);
    const second = await createFixture(transaction);
    const data = { paciente_id: first.patient.id, profesional_id: first.professional.id, inicio: start, fin: end };
    const reserved = await Turno.create(data, { transaction });
    await Turno.create({ ...data, profesional_id: second.professional.id }, { transaction });
    await Turno.create({ ...data, estado: 'atendido' }, { transaction });
    await Turno.create({ ...data, estado: 'ausente' }, { transaction });
    await Turno.create({ ...data, estado: 'cancelado', cancelado_en: start }, { transaction });
    await reserved.update({ estado: 'cancelado', cancelado_en: start }, { transaction });
    await Turno.create(data, { transaction });
  } finally {
    await transaction.rollback();
  }
});

test('la exclusión rechaza un turno reservado solapado para el mismo profesional', async () => {
  const transaction = await database.transaction();
  try {
    const { patient, professional } = await createFixture(transaction);
    const data = { paciente_id: patient.id, profesional_id: professional.id, inicio: start, fin: end };
    await Turno.create(data, { transaction });
    await assert.rejects(
      Turno.create({ ...data, inicio: new Date('2026-01-01T10:30:00Z') }, { transaction }),
      (error: unknown) => hasCode(error, '23P01'),
    );
  } finally {
    await transaction.rollback();
  }
});

for (const changes of [
  { inicio: end },
  { version: 0 },
  { estado: 'cancelado' as const },
  { estado: 'reservado' as const, cancelado_en: start },
]) {
  test(`el turno rechaza datos inválidos: ${JSON.stringify(changes)}`, async () => {
    const transaction = await database.transaction();
    try {
      const { patient, professional } = await createFixture(transaction);
      await assert.rejects(Turno.create({
        paciente_id: patient.id, profesional_id: professional.id, inicio: start, fin: end, ...changes,
      }, { transaction }), (error: unknown) => hasCode(error, '23514'));
    } finally {
      await transaction.rollback();
    }
  });
}

test('la base rechaza estados de turno no previstos', async () => {
  const transaction = await database.transaction();
  try {
    const { patient, professional } = await createFixture(transaction);
    await assert.rejects(database.query(
      'INSERT INTO turnos (paciente_id, profesional_id, inicio, fin, estado) VALUES ($1, $2, $3, $4, $5)',
      { bind: [patient.id, professional.id, start, end, 'otro'], transaction },
    ), (error: unknown) => hasCode(error, '23514'));
  } finally {
    await transaction.rollback();
  }
});

for (const target of ['paciente', 'profesional'] as const) {
  test(`el turno requiere un ${target} existente`, async () => {
    const transaction = await database.transaction();
    try {
      const { patient, professional } = await createFixture(transaction);
      const missing = '11111111-1111-4111-8111-111111111111';
      await assert.rejects(Turno.create({
        paciente_id: target === 'paciente' ? missing : patient.id,
        profesional_id: target === 'profesional' ? missing : professional.id,
        inicio: start, fin: end,
      }, { transaction }), ForeignKeyConstraintError);
    } finally {
      await transaction.rollback();
    }
  });

  test(`no se elimina físicamente un ${target} con turnos`, async () => {
    const transaction = await database.transaction();
    try {
      const { patient, professional } = await createFixture(transaction);
      await Turno.create({ paciente_id: patient.id, profesional_id: professional.id, inicio: start, fin: end }, { transaction });
      const deletion = target === 'paciente'
        ? Paciente.destroy({ where: { id: patient.id }, transaction })
        : Profesional.destroy({ where: { id: professional.id }, transaction });
      await assert.rejects(deletion, (error: unknown) => hasCode(error, '23001') || hasCode(error, '23503'));
    } finally {
      await transaction.rollback();
    }
  });
}

test('dos reservas simultáneas solapadas no pueden confirmarse', async () => {
  const fixture = await database.transaction(createFixture);
  const firstId = randomUUID();
  const first = await database.transaction();
  const second = await database.transaction();
  let firstFinished = false;
  let pending: Promise<unknown> | undefined;
  try {
    const data = { paciente_id: fixture.patient.id, profesional_id: fixture.professional.id, inicio: start, fin: end };
    await Turno.create({ ...data, id: firstId }, { transaction: first });
    await database.query("SET LOCAL statement_timeout = '5s'", { transaction: second });
    const [backend] = await database.query<{ pid: number }>('SELECT pg_backend_pid() AS pid', {
      type: QueryTypes.SELECT, transaction: second,
    });
    assert.ok(backend);
    pending = Turno.create(data, { transaction: second }).then(() => null, (error: unknown) => error);

    let blocked = false;
    for (let attempt = 0; attempt < 50 && !blocked; attempt += 1) {
      const [result] = await database.query<{ blocked: boolean }>(
        'SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked',
        { bind: [backend.pid], type: QueryTypes.SELECT },
      );
      blocked = result?.blocked ?? false;
      if (!blocked) await delay(50);
    }
    assert.ok(blocked, 'la segunda reserva debe esperar la primera');
    await first.commit();
    firstFinished = true;
    assert.ok(hasCode(await pending, '23P01'));
  } finally {
    if (!firstFinished) await first.rollback();
    if (pending) await pending;
    await second.rollback();
    await database.transaction(async (transaction) => {
      await Turno.destroy({ where: { id: firstId }, transaction });
      await Paciente.destroy({ where: { id: fixture.patient.id }, transaction });
      await Profesional.destroy({ where: { id: fixture.professional.id }, transaction });
      await Zona.destroy({ where: { id: fixture.zone.id }, transaction });
      await Usuario.destroy({ where: { id: fixture.user.id }, transaction });
    });
  }
});
