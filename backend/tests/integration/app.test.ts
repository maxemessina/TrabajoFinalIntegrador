import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import { ConnectionError } from 'sequelize';
import { createApp } from '../../src/app.ts';
import { errorHandler } from '../../src/middleware/errors.ts';

let server: Server;
let baseUrl: string;

before(async () => {
  const app = createApp({ corsOrigin: 'http://localhost:5173' });
  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('El servidor de prueba no tiene un puerto TCP');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('health responde correctamente', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { status: 'ok' } });
});

test('sin base configurada auth devuelve 503 y health sigue disponible', async () => {
  const health = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(health.status, 200);
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ana@example.invalid', password: 'password' }),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: { code: 'SERVICE_UNAVAILABLE', message: 'La autenticación no está disponible temporalmente' },
  });
  const patients = await fetch(`${baseUrl}/api/v1/pacientes`);
  assert.equal(patients.status, 503);
  assert.deepEqual(await patients.json(), {
    error: { code: 'SERVICE_UNAVAILABLE', message: 'La API de pacientes no está disponible temporalmente' },
  });
  const patientCreate = await fetch(`${baseUrl}/api/v1/pacientes`, { method: 'POST' });
  assert.equal(patientCreate.status, 503);
});

test('CORS permite el origen configurado incluso en preflight', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('CORS no autoriza otros orígenes', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    headers: { Origin: 'https://otro.example' },
  });
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('rutas inexistentes tienen una respuesta de error uniforme', async () => {
  const response = await fetch(`${baseUrl}/api/v1/inexistente`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' },
  });
});

test('JSON inválido devuelve 400 sin exponer detalles internos', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido' },
  });
});

test('una solicitud demasiado grande devuelve 413', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'a'.repeat(103000) }),
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo de la solicitud es demasiado grande' },
  });
});

test('una codificación no compatible devuelve 415', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=invalid' },
    body: '{}',
  });
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), {
    error: { code: 'UNSUPPORTED_ENCODING', message: 'La codificación de la solicitud no es compatible' },
  });
});

test('errores inesperados se registran sin revelar detalles al cliente', async (context) => {
  const log = context.mock.method(console, 'error', () => {});
  const app = express();
  app.get('/', () => { throw new Error('detalle interno'); });
  app.use(errorHandler);
  const errorServer = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    const address = errorServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('El servidor de prueba no tiene un puerto TCP');
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
    });
    assert.equal(log.mock.callCount(), 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      errorServer.close((error) => error ? reject(error) : resolve()));
  }
});

test('errores de conexión con PostgreSQL devuelven 503 sin exponer detalles', async (context) => {
  const log = context.mock.method(console, 'error', () => {});
  const app = express();
  app.get('/', () => { throw new ConnectionError(new Error('postgres://secret@host/db')); });
  app.use(errorHandler);
  const errorServer = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    const address = errorServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('El servidor de prueba no tiene un puerto TCP');
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible temporalmente' },
    });
    assert.equal(log.mock.callCount(), 1);
    assert.doesNotMatch(JSON.stringify(log.mock.calls[0]?.arguments), /secret@host/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      errorServer.close((error) => error ? reject(error) : resolve()));
  }
});
