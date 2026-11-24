import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { errorHandler } from '../../src/middleware/errors.ts';
import { requireRoles } from '../../src/middleware/auth.ts';

async function startServer(handler: express.Express): Promise<{ server: Server; url: string }> {
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = handler.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('El servidor de prueba no tiene un puerto TCP');
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test('la autorización por roles devuelve 401 sin identidad y 403 sin el rol solicitado', async () => {
  const app = express();
  app.get('/sin-identidad', requireRoles('administrador'), (_request, response) => response.sendStatus(204));
  app.get('/paciente', (request, _response, next) => {
    request.auth = {
      userId: '11111111-1111-4111-8111-111111111111',
      roles: ['paciente'],
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        nombre: 'Ana',
        apellido: 'Ejemplo',
        email: 'ana@example.invalid',
        telefono: null,
        estado: 'activo',
        roles: ['paciente'],
        creado_en: new Date(0),
        actualizado_en: new Date(0),
      },
    };
    next();
  }, requireRoles('administrador'), (_request, response) => response.sendStatus(204));
  app.use(errorHandler);
  const { server, url } = await startServer(app);
  try {
    const unauthenticated = await fetch(`${url}/sin-identidad`);
    assert.equal(unauthenticated.status, 401);
    const forbidden = await fetch(`${url}/paciente`);
    assert.equal(forbidden.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
});
