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
const { Usuario, Zona, Profesional, EventoVisita } = defineModels(database);
const occurred = new Date('2026-01-01T12:00:00Z');

before(async () => {
  await runMigrations(database);
});

after(async () => {
  await database.close();
});

async function createFixture(transaction: Transaction) {
  const user = await Usuario.create({
    nombre: 'Ana', apellido: 'Ejemplo', email: 'eventos@example.invalid', password_hash: 'hash-ficticio',
  }, { transaction });
  const zone = await Zona.create({ nombre: 'Zona eventos test', provincia: 'Provincia test' }, { transaction });
  const professional = await Profesional.create({
    usuario_id: user.id, zona_id: zone.id, matricula: 'EVENTOS-TEST',
    direccion_atencion: 'Direccion ficticia', duracion_consulta_min: 30,
  }, { transaction });
  return { user, professional };
}

function isCheckError(error: unknown): boolean {
  return error instanceof DatabaseError &&
    typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === '23514';
}

test('admite visitas anónimas al inicio y visitas identificadas a un perfil', async () => {
  const transaction = await database.transaction();
  try {
    const { user, professional } = await createFixture(transaction);
    const home = await EventoVisita.create({ tipo: 'visita_inicio', ocurrido_en: occurred }, { transaction });
    const profile = await EventoVisita.create({
      usuario_id: user.id, profesional_id: professional.id, tipo: 'visita_perfil', ocurrido_en: occurred,
    }, { transaction });
    await EventoVisita.create({
      profesional_id: professional.id, tipo: 'visita_perfil', ocurrido_en: occurred,
    }, { transaction });
    await EventoVisita.create({ usuario_id: user.id, tipo: 'visita_inicio', ocurrido_en: occurred }, { transaction });
    assert.equal(home.usuario_id, null);
    assert.equal(home.profesional_id, null);
    assert.equal(profile.ocurrido_en.toISOString(), occurred.toISOString());
    const linked = await EventoVisita.findOne({
      where: { id: profile.id },
      include: [
        { model: Usuario, as: 'usuario', where: { id: user.id } },
        { model: Profesional, as: 'profesional', where: { id: professional.id } },
      ],
      transaction,
    });
    assert.ok(linked);
  } finally {
    await transaction.rollback();
  }
});

test('la base rechaza tipos de evento no previstos', async () => {
  const transaction = await database.transaction();
  try {
    await assert.rejects(database.query(
      'INSERT INTO eventos_visita (tipo, ocurrido_en) VALUES ($1, $2)',
      { bind: ['otro', occurred], transaction },
    ), isCheckError);
  } finally {
    await transaction.rollback();
  }
});

for (const kind of ['perfil_sin_profesional', 'inicio_con_profesional'] as const) {
  test(`el tipo y profesional del evento deben coincidir: ${kind}`, async () => {
    const transaction = await database.transaction();
    try {
      const { professional } = await createFixture(transaction);
      const data = kind === 'perfil_sin_profesional'
        ? { tipo: 'visita_perfil' as const, profesional_id: null }
        : { tipo: 'visita_inicio' as const, profesional_id: professional.id };
      await assert.rejects(EventoVisita.create({ ...data, ocurrido_en: occurred }, { transaction }), isCheckError);
    } finally {
      await transaction.rollback();
    }
  });
}

for (const target of ['usuario', 'profesional'] as const) {
  test(`el evento rechaza un ${target} inexistente`, async () => {
    const transaction = await database.transaction();
    try {
      const missing = '11111111-1111-4111-8111-111111111111';
      const data = target === 'usuario'
        ? { tipo: 'visita_inicio' as const, usuario_id: missing }
        : { tipo: 'visita_perfil' as const, profesional_id: missing };
      await assert.rejects(EventoVisita.create({ ...data, ocurrido_en: occurred }, { transaction }), ForeignKeyConstraintError);
    } finally {
      await transaction.rollback();
    }
  });

  test(`no se elimina físicamente un ${target} referenciado por un evento`, async () => {
    const transaction = await database.transaction();
    try {
      const { professional } = await createFixture(transaction);
      const visitor = await Usuario.create({
        nombre: 'Luis', apellido: 'Ejemplo', email: 'visitante@example.invalid', password_hash: 'hash-ficticio',
      }, { transaction });
      await EventoVisita.create({
        tipo: 'visita_perfil', usuario_id: visitor.id, profesional_id: professional.id, ocurrido_en: occurred,
      }, { transaction });
      const deletion = target === 'usuario'
        ? Usuario.destroy({ where: { id: visitor.id }, transaction })
        : Profesional.destroy({ where: { id: professional.id }, transaction });
      await assert.rejects(deletion, (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent &&
        (error.parent.code === '23001' || error.parent.code === '23503'));
    } finally {
      await transaction.rollback();
    }
  });
}
