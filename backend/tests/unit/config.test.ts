import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAuthConfig, readConfig } from '../../src/config.ts';

test('la configuración local tiene valores predeterminados', () => {
  assert.deepEqual(readConfig({}), { port: 3000, corsOrigin: 'http://localhost:5173' });
});

test('producción requiere un origen explícito y válido', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /CORS_ORIGIN/);
  assert.throws(() => readConfig({ NODE_ENV: 'production', CORS_ORIGIN: '*' }), /CORS_ORIGIN/);
  assert.throws(() => readConfig({ NODE_ENV: 'production', CORS_ORIGIN: 'https://example.com/path' }), /CORS_ORIGIN/);
  assert.equal(
    readConfig({ NODE_ENV: 'production', CORS_ORIGIN: 'https://portal.example' }).corsOrigin,
    'https://portal.example',
  );
});

test('rechaza puertos y entornos inválidos', () => {
  for (const port of ['', '0', '65536', '3000abc', '-1']) {
    assert.throws(() => readConfig({ PORT: port }), /PORT/);
  }
  assert.throws(() => readConfig({ NODE_ENV: 'produccion' }), /NODE_ENV/);
  assert.throws(() => readConfig({ CORS_ORIGIN: '' }), /CORS_ORIGIN/);
});

test('la configuración de autenticación exige una clave aleatoria de al menos 32 bytes', () => {
  const secret = 'clave-de-prueba-aleatoria-de-32-bytes';
  assert.deepEqual(readAuthConfig({ JWT_SECRET: secret }), { jwtSecret: secret });
  for (const JWT_SECRET of ['', 'corta', `${secret} `]) {
    assert.throws(() => readAuthConfig({ JWT_SECRET }), /JWT_SECRET/);
  }
  assert.deepEqual(readConfig({}), { port: 3000, corsOrigin: 'http://localhost:5173' });
});
