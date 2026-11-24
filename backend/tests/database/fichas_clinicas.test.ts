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
const { Usuario, Zona, Paciente, Profesional, FichaClinica } = defineModels(database);

before(async () => {
  await runMigrations(database);
});

after(async () => {
  await database.close();
});

async function createFixture(transaction: Transaction) {
  const suffix = randomUUID();
  const user = await Usuario.create({
    nombre: 'Ana', apellido: 'Ejemplo', email: `ficha-${suffix}@example.invalid`, password_hash: 'hash-ficticio',
  }, { transaction });
  const zone = await Zona.create({ nombre: `Zona ${suffix}`, provincia: 'Provincia test' }, { transaction });
  const patient = await Paciente.create({ usuario_id: user.id }, { transaction });
  const professional = await Profesional.create({
    usuario_id: user.id, zona_id: zone.id, matricula: `FICHA-${suffix}`,
    direccion_atencion: 'Direccion ficticia', duracion_consulta_min: 30,
  }, { transaction });
  return { patient, professional };
}

test('una ficha se relaciona con su paciente y profesional y admite otras parejas', async () => {
  const transaction = await database.transaction();
  try {
    const first = await createFixture(transaction);
    const second = await createFixture(transaction);
    const ficha = await FichaClinica.create({
      paciente_id: first.patient.id, profesional_id: first.professional.id,
    }, { transaction });
    await FichaClinica.create({ paciente_id: first.patient.id, profesional_id: second.professional.id }, { transaction });
    await FichaClinica.create({ paciente_id: second.patient.id, profesional_id: first.professional.id }, { transaction });
    assert.ok(ficha.creado_en instanceof Date);
    assert.ok(ficha.actualizado_en instanceof Date);
    assert.ok(await FichaClinica.findOne({
      where: { id: ficha.id },
      include: [
        { model: Paciente, as: 'paciente', where: { id: first.patient.id } },
        { model: Profesional, as: 'profesional', where: { id: first.professional.id } },
      ],
      transaction,
    }));
    assert.equal(await FichaClinica.count({
      include: [{ model: Paciente, as: 'paciente', where: { id: first.patient.id } }], transaction,
    }), 2);
    assert.ok(await Paciente.findOne({
      where: { id: first.patient.id },
      include: [{ model: FichaClinica, as: 'fichasClinicas', where: { id: ficha.id } }], transaction,
    }));
    assert.ok(await Profesional.findOne({
      where: { id: first.professional.id },
      include: [{ model: FichaClinica, as: 'fichasClinicas', where: { id: ficha.id } }], transaction,
    }));
  } finally {
    await transaction.rollback();
  }
});

test('no se duplica la ficha de una pareja paciente-profesional', async () => {
  const transaction = await database.transaction();
  try {
    const { patient, professional } = await createFixture(transaction);
    const data = { paciente_id: patient.id, profesional_id: professional.id };
    await FichaClinica.create(data, { transaction });
    await assert.rejects(FichaClinica.create(data, { transaction }), UniqueConstraintError);
  } finally {
    await transaction.rollback();
  }
});

for (const missing of ['paciente', 'profesional'] as const) {
  test(`una ficha requiere un ${missing} existente`, async () => {
    const transaction = await database.transaction();
    try {
      const { patient, professional } = await createFixture(transaction);
      const absent = randomUUID();
      await assert.rejects(FichaClinica.create({
        paciente_id: missing === 'paciente' ? absent : patient.id,
        profesional_id: missing === 'profesional' ? absent : professional.id,
      }, { transaction }), ForeignKeyConstraintError);
    } finally {
      await transaction.rollback();
    }
  });
}

for (const target of ['paciente', 'profesional'] as const) {
  test(`no puede borrarse un ${target} con ficha clínica`, async () => {
    const transaction = await database.transaction();
    try {
      const { patient, professional } = await createFixture(transaction);
      await FichaClinica.create({ paciente_id: patient.id, profesional_id: professional.id }, { transaction });
      const deletion = target === 'paciente'
        ? Paciente.destroy({ where: { id: patient.id }, transaction })
        : Profesional.destroy({ where: { id: professional.id }, transaction });
      await assert.rejects(deletion, (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent &&
        (error.parent.code === '23001' || error.parent.code === '23503'));
    } finally {
      await transaction.rollback();
    }
  });
}
