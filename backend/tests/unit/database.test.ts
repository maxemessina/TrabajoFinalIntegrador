import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDatabase, readDatabaseUrl } from '../../src/database/connection.ts';

test('requiere una URL explícita para la base', () => {
  for (const env of [{}, { DATABASE_URL: '' }]) {
    assert.throws(() => readDatabaseUrl(env), /DATABASE_URL/);
  }
});

test('rechaza URLs inválidas sin mostrar su contenido', () => {
  for (const value of [
    'no-es-una-url',
    'mysql://localhost/portal',
    'postgres://localhost/',
    'postgres://localhost/portal#fragmento',
    ' postgres://localhost/portal',
  ]) {
    assert.throws(() => readDatabaseUrl({ DATABASE_URL: value }), (error: Error) => {
      assert.match(error.message, /DATABASE_URL/);
      assert.ok(!error.message.includes(value));
      return true;
    });
  }
});

test('crea una instancia Sequelize para una URL PostgreSQL sin conectar', async () => {
  const url = readDatabaseUrl({ DATABASE_URL: 'postgresql://localhost:5432/portal' });
  const database = createDatabase(url);
  assert.equal(database.getDialect(), 'postgres');
  await database.close();
});

test('el comando rechaza una URL inválida sin mostrarla', () => {
  const url = 'postgres://usuario:clave-ficticia@/portal';
  const script = fileURLToPath(new URL('../../src/database/check.ts', import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });

  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL/);
  assert.ok(!result.stderr.includes(url));
  assert.ok(!result.stderr.includes('clave-ficticia'));
});
