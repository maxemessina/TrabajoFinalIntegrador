import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseError, UniqueConstraintError } from 'sequelize';
import { createDatabase, readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { defineUsuario } from '../../src/models/Usuario.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const database = createDatabase(readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL }));
const Usuario = defineUsuario(database);

before(async () => {
  const results = await Promise.all([runMigrations(database), runMigrations(database)]);
  assert.ok(results.flat().filter((name) => name === '001_create_usuarios').length <= 1);
});

after(async () => {
  await database.close();
});

test('las migraciones aplicadas no se ejecutan de nuevo', async () => {
  assert.deepEqual(await runMigrations(database), []);
});

test('el modelo coincide con las columnas y nulabilidad de la tabla', async () => {
  const columns = await database.getQueryInterface().describeTable('usuarios');
  const attributes = Object.entries(Usuario.getAttributes());
  assert.deepEqual(Object.keys(columns).sort(), attributes.map(([name]) => name).sort());
  for (const [name, column] of Object.entries(columns)) {
    const attribute = attributes.find(([attributeName]) => attributeName === name);
    assert.ok(attribute);
    assert.equal(column.allowNull, attribute[1].allowNull);
    assert.equal(column.primaryKey, attribute[1].primaryKey ?? false);
  }
});

test('el modelo guarda un usuario con valores y fechas automáticos', async () => {
  const transaction = await database.transaction();
  try {
    const user = await Usuario.create({
      nombre: 'Ana',
      apellido: 'Ejemplo',
      email: 'ana@example.invalid',
      password_hash: 'hash-ficticio',
    }, { transaction });
    assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(user.estado, 'activo');
    assert.equal(user.telefono, null);
    assert.ok(user.creado_en instanceof Date);
    assert.ok(user.actualizado_en instanceof Date);
    const stored = await Usuario.findByPk(user.id, { transaction });
    assert.equal(stored?.email, 'ana@example.invalid');
  } finally {
    await transaction.rollback();
  }
});

test('el email es único sin distinguir mayúsculas', async () => {
  const transaction = await database.transaction();
  try {
    const data = { nombre: 'Ana', apellido: 'Ejemplo', password_hash: 'hash-ficticio' };
    await Usuario.create({ ...data, email: 'Ana@example.invalid' }, { transaction });
    await assert.rejects(
      Usuario.create({ ...data, email: 'ana@example.invalid' }, { transaction }),
      UniqueConstraintError,
    );
  } finally {
    await transaction.rollback();
  }
});

test('la base rechaza estados distintos de activo e inactivo', async () => {
  const transaction = await database.transaction();
  try {
    await assert.rejects(
      database.query(
        'INSERT INTO usuarios (nombre, apellido, email, password_hash, estado) VALUES ($1, $2, $3, $4, $5)',
        { bind: ['Ana', 'Ejemplo', 'ana@example.invalid', 'hash-ficticio', 'desconocido'], transaction },
      ),
      (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === '23514',
    );
  } finally {
    await transaction.rollback();
  }
});
