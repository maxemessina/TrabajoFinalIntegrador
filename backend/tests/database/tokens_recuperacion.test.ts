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
const { Usuario, TokenRecuperacion } = defineModels(database);
const expiry = new Date('2030-01-01T12:00:00Z');

before(async () => {
  await runMigrations(database);
});

after(async () => {
  await database.close();
});

async function createUser(transaction: Transaction) {
  return Usuario.create({
    nombre: 'Ana', apellido: 'Ejemplo', email: 'recuperacion@example.invalid', password_hash: 'hash-ficticio',
  }, { transaction });
}

test('un usuario puede asociar varios registros de recuperación', async () => {
  const transaction = await database.transaction();
  try {
    const user = await createUser(transaction);
    const first = await TokenRecuperacion.create({
      usuario_id: user.id, token_hash: 'hash-ficticio-uno', expira_en: expiry,
    }, { transaction });
    await TokenRecuperacion.create({
      usuario_id: user.id, token_hash: 'hash-ficticio-dos', expira_en: expiry,
    }, { transaction });
    assert.equal(first.usado_en, null);
    assert.equal(first.expira_en.toISOString(), expiry.toISOString());
    const matchedUser = await Usuario.findOne({
      where: { id: user.id },
      include: [{ model: TokenRecuperacion, as: 'tokensRecuperacion', where: { id: first.id } }],
      transaction,
    });
    const matchedToken = await TokenRecuperacion.findOne({
      where: { id: first.id },
      include: [{ model: Usuario, as: 'usuario', where: { id: user.id } }],
      transaction,
    });
    assert.ok(matchedUser);
    assert.ok(matchedToken);
    assert.equal(await TokenRecuperacion.count({ where: { usuario_id: user.id }, transaction }), 2);
  } finally {
    await transaction.rollback();
  }
});

test('el hash de recuperación no puede repetirse', async () => {
  const transaction = await database.transaction();
  try {
    const user = await createUser(transaction);
    const data = { usuario_id: user.id, token_hash: 'hash-ficticio', expira_en: expiry };
    await TokenRecuperacion.create(data, { transaction });
    await assert.rejects(TokenRecuperacion.create(data, { transaction }), UniqueConstraintError);
  } finally {
    await transaction.rollback();
  }
});

test('el registro de recuperación requiere un usuario existente', async () => {
  const transaction = await database.transaction();
  try {
    await assert.rejects(TokenRecuperacion.create({
      usuario_id: '11111111-1111-4111-8111-111111111111', token_hash: 'hash-ficticio', expira_en: expiry,
    }, { transaction }), ForeignKeyConstraintError);
  } finally {
    await transaction.rollback();
  }
});

test('no se elimina físicamente un usuario con registros de recuperación', async () => {
  const transaction = await database.transaction();
  try {
    const user = await createUser(transaction);
    await TokenRecuperacion.create({
      usuario_id: user.id, token_hash: 'hash-ficticio', expira_en: expiry,
    }, { transaction });
    await assert.rejects(
      Usuario.destroy({ where: { id: user.id }, transaction }),
      (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent &&
        (error.parent.code === '23001' || error.parent.code === '23503'),
    );
  } finally {
    await transaction.rollback();
  }
});
