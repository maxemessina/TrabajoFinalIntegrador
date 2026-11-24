import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseError, ForeignKeyConstraintError } from 'sequelize';
import type { Transaction } from 'sequelize';
import { createDatabase, readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { defineModels } from '../../src/models/index.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const database = createDatabase(readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL }));
const { Usuario, Zona, Profesional, HorarioAtencion, BloqueoAgenda } = defineModels(database);
const schedule = { dia_semana: 1, hora_inicio: '09:00', hora_fin: '12:00', vigente_desde: '2026-01-01' };
const block = { inicio: new Date('2026-01-01T12:00:00Z'), fin: new Date('2026-01-01T13:00:00Z') };

before(async () => {
  await runMigrations(database);
});

after(async () => {
  await database.close();
});

async function createProfessional(transaction: Transaction) {
  const user = await Usuario.create({
    nombre: 'Ana', apellido: 'Ejemplo', email: 'agenda@example.invalid', password_hash: 'hash-ficticio',
  }, { transaction });
  const zone = await Zona.create({ nombre: 'Zona agenda test', provincia: 'Provincia test' }, { transaction });
  return Profesional.create({
    usuario_id: user.id, zona_id: zone.id, matricula: 'AGENDA-TEST',
    direccion_atencion: 'Direccion ficticia', duracion_consulta_min: 30,
  }, { transaction });
}

function isCheckError(error: unknown): boolean {
  return error instanceof DatabaseError &&
    typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === '23514';
}

test('horarios y bloqueos se asocian al profesional y admiten fechas límite válidas', async () => {
  const transaction = await database.transaction();
  try {
    const professional = await createProfessional(transaction);
    const open = await HorarioAtencion.create({ ...schedule, profesional_id: professional.id }, { transaction });
    const bounded = await HorarioAtencion.create({
      ...schedule, profesional_id: professional.id, dia_semana: 7, vigente_hasta: schedule.vigente_desde,
    }, { transaction });
    const first = await BloqueoAgenda.create({ ...block, profesional_id: professional.id }, { transaction });
    const adjacent = await BloqueoAgenda.create({
      profesional_id: professional.id, inicio: block.fin, fin: new Date('2026-01-01T14:00:00Z'),
    }, { transaction });
    assert.equal(open.activo, true);
    assert.equal(open.vigente_hasta, null);
    assert.equal(bounded.vigente_hasta, schedule.vigente_desde);
    assert.equal(first.motivo, null);
    assert.notEqual(first.id, adjacent.id);
    const result = await Profesional.findOne({
      where: { id: professional.id },
      include: [
        { model: HorarioAtencion, as: 'horarios', where: { id: open.id } },
        { model: BloqueoAgenda, as: 'bloqueos', where: { id: first.id } },
      ],
      transaction,
    });
    assert.ok(result);
  } finally {
    await transaction.rollback();
  }
});

for (const changes of [
  { dia_semana: 0 }, { dia_semana: 8 },
  { hora_fin: '09:00' }, { hora_fin: '08:00' },
  { vigente_hasta: '2025-12-31' },
]) {
  test(`el horario rechaza valores inválidos: ${JSON.stringify(changes)}`, async () => {
    const transaction = await database.transaction();
    try {
      const professional = await createProfessional(transaction);
      await assert.rejects(
        HorarioAtencion.create({ ...schedule, ...changes, profesional_id: professional.id }, { transaction }),
        isCheckError,
      );
    } finally {
      await transaction.rollback();
    }
  });
}

for (const end of ['2026-01-01T12:00:00Z', '2026-01-01T11:00:00Z']) {
  test(`el bloqueo rechaza fin igual o anterior a inicio: ${end}`, async () => {
    const transaction = await database.transaction();
    try {
      const professional = await createProfessional(transaction);
      await assert.rejects(
        BloqueoAgenda.create({ ...block, fin: new Date(end), profesional_id: professional.id }, { transaction }),
        isCheckError,
      );
    } finally {
      await transaction.rollback();
    }
  });
}

for (const target of ['horario', 'bloqueo'] as const) {
  test(`${target} requiere un profesional existente`, async () => {
    const transaction = await database.transaction();
    try {
      const profesional_id = '11111111-1111-4111-8111-111111111111';
      const creation = target === 'horario'
        ? HorarioAtencion.create({ ...schedule, profesional_id }, { transaction })
        : BloqueoAgenda.create({ ...block, profesional_id }, { transaction });
      await assert.rejects(creation, ForeignKeyConstraintError);
    } finally {
      await transaction.rollback();
    }
  });

  test(`no se elimina físicamente un profesional con ${target}`, async () => {
    const transaction = await database.transaction();
    try {
      const professional = await createProfessional(transaction);
      if (target === 'horario') {
        await HorarioAtencion.create({ ...schedule, profesional_id: professional.id }, { transaction });
      } else {
        await BloqueoAgenda.create({ ...block, profesional_id: professional.id }, { transaction });
      }
      await assert.rejects(
        Profesional.destroy({ where: { id: professional.id }, transaction }),
        (error: unknown) => error instanceof DatabaseError &&
          typeof error.parent === 'object' && 'code' in error.parent &&
          (error.parent.code === '23001' || error.parent.code === '23503'),
      );
    } finally {
      await transaction.rollback();
    }
  });
}
