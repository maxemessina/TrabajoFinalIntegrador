import { createHash, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { Sequelize } from 'sequelize';
import express from 'express';
import { createApp } from '../../src/app.ts';
import { readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { defineModels } from '../../src/models/index.ts';
import { createAuthService } from '../../src/services/auth.service.ts';
import type { PasswordResetEmail } from '../../src/services/email.service.ts';
import { verifyPassword } from '../../src/services/password.service.ts';
import { requireAuth, requireRoles } from '../../src/middleware/auth.ts';
import { errorHandler } from '../../src/middleware/errors.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const databaseUrl = readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL });
const schema = `auth_test_${randomUUID().replaceAll('-', '')}`;
const databaseOptions = { logging: false, dialectOptions: { options: `-c search_path=${schema},public` } };
const adminDatabase = new Sequelize(databaseUrl, { logging: false });
const database = new Sequelize(databaseUrl, databaseOptions);
const authDatabase = new Sequelize(databaseUrl, databaseOptions);
const { Usuario, Rol, UsuarioRol, Paciente, TokenRecuperacion } = defineModels(database);
const jwtSecret = 'test-secret-with-more-than-32-random-looking-bytes';
const emails: PasswordResetEmail[] = [];
const emailService = {
  async sendPasswordReset(message: PasswordResetEmail) {
    emails.push(message);
  },
};
let server: Server;
let adminServer: Server;
let baseUrl: string;
let adminBaseUrl: string;
let schemaCreated = false;

before(async () => {
  await runMigrations(adminDatabase);
  await adminDatabase.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  await adminDatabase.query(
    `CREATE TABLE "${schema}".schema_migrations (nombre varchar(255) PRIMARY KEY, ejecutada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  await runMigrations(database);
  const app = createApp(
    { corsOrigin: 'http://localhost:5173' },
    { database: authDatabase, jwtSecret, emailService },
  );
  const authService = createAuthService(authDatabase, jwtSecret, emailService);
  const adminApp = express();
  adminApp.get('/test-admin', requireAuth(authService), requireRoles('administrador'), (_request, response) => {
    response.status(200).json({ data: { status: 'ok' } });
  });
  adminApp.use(errorHandler);
  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  adminServer = await new Promise<Server>((resolve, reject) => {
    const listener = adminApp.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const address = server.address();
  const adminAddress = adminServer.address();
  if (!address || typeof address === 'string' || !adminAddress || typeof adminAddress === 'string') {
    throw new Error('El servidor de prueba no tiene un puerto TCP');
  }
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  adminBaseUrl = `http://127.0.0.1:${adminAddress.port}/test-admin`;
});

after(async () => {
  try {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
    }
    if (adminServer) {
      await new Promise<void>((resolve, reject) =>
        adminServer.close((error) => error ? reject(error) : resolve()));
    }
    await Promise.all([database.close(), authDatabase.close()]);
    if (schemaCreated) {
      await adminDatabase.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  } finally {
    await adminDatabase.close();
  }
});

async function post(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

test('registro valida el DTO y crea usuario, rol y perfil de forma segura', async () => {
  const email = `auth-${randomUUID()}@example.invalid`;
  const password = 'contraseña-segura-1';
  const invalid = await post('/auth/registro', {
    nombre: 'Ana', apellido: 'Ejemplo', email, password, rol: 'administrador',
  });
  assert.equal(invalid.status, 400);

  const response = await post('/auth/registro', {
    nombre: ' Ana ', apellido: ' Ejemplo ', email: ` ${email.toUpperCase()} `, password,
    fecha_nacimiento: '1990-01-01',
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('location')?.startsWith('/api/v1/pacientes/'), true);
  const result = await readJson<{ data: { usuario: Record<string, unknown>; paciente: Record<string, unknown> } }>(response);
  const userId = result.data.usuario.id;
  assert.equal(result.data.usuario.email, email.toLowerCase());
  assert.deepEqual(result.data.usuario.roles, ['paciente']);
  assert.equal(result.data.paciente.usuario_id, userId);
  assert.equal(result.data.paciente.fecha_nacimiento, '1990-01-01');
  assert.equal(result.data.paciente.activo, true);
  assert.equal('password_hash' in result.data.usuario, false);
  const user = await Usuario.findByPk(String(userId));
  assert.ok(user);
  assert.notEqual(user.password_hash, password);
  assert.match(user.password_hash, /^scrypt\$/);
  assert.equal(await verifyPassword(password, user.password_hash), true);
  assert.equal(await Paciente.count({ where: { usuario_id: user.id } }), 1);
  assert.deepEqual((await Rol.findAll({
    include: [{ model: Usuario, as: 'usuarios', where: { id: user.id }, through: { attributes: [] } }],
  })).map((role) => role.codigo), ['paciente']);

  const duplicate = await post('/auth/registro', {
    nombre: 'Ana', apellido: 'Ejemplo', email: email.toUpperCase(), password,
  });
  assert.equal(duplicate.status, 409);
  assert.equal(await Usuario.count({ where: { email: email.toLowerCase() } }), 1);

  const futureDate = await post('/auth/registro', {
    nombre: 'Ana', apellido: 'Ejemplo', email: `fecha-${randomUUID()}@example.invalid`,
    password, fecha_nacimiento: '2099-01-01',
  });
  assert.equal(futureDate.status, 400);
});

test('login, perfil propio, permisos, desactivación y roles vigentes', async () => {
  const email = `login-${randomUUID()}@example.invalid`;
  const password = 'contraseña-segura-2';
  const registration = await post('/auth/registro', {
    nombre: 'Paciente', apellido: 'Autenticado', email, password,
  });
  const registered = await readJson<{ data: { usuario: { id: string } } }>(registration);
  const userId = registered.data.usuario.id;

  const login = await post('/auth/login', { email: email.toUpperCase(), password });
  assert.equal(login.status, 200);
  const response = await readJson<{ data: { access_token: string; token_type: string; expires_in: number; usuario: Record<string, unknown> } }>(login);
  assert.equal(response.data.token_type, 'Bearer');
  assert.equal(response.data.expires_in, 3600);
  assert.deepEqual(response.data.usuario.roles, ['paciente']);
  assert.equal('password_hash' in response.data.usuario, false);

  const profile = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${response.data.access_token}` } });
  assert.equal(profile.status, 200);
  const profileBody = await readJson<{ data: Record<string, unknown> }>(profile);
  assert.equal(profileBody.data.id, userId);
  assert.equal('password_hash' in profileBody.data, false);

  const missingToken = await fetch(`${baseUrl}/me`);
  assert.equal(missingToken.status, 401);
  const invalidToken = await fetch(`${baseUrl}/me`, { headers: { Authorization: 'Bearer invalid' } });
  assert.equal(invalidToken.status, 401);
  const invalidPassword = await post('/auth/login', { email, password: 'password equivocada' });
  const unknownAccount = await post('/auth/login', { email: `no-existe-${randomUUID()}@example.invalid`, password });
  assert.equal(invalidPassword.status, 401);
  assert.deepEqual(await readJson(invalidPassword), await readJson(unknownAccount));

  const deniedAdmin = await fetch(adminBaseUrl, {
    headers: { Authorization: `Bearer ${response.data.access_token}` },
  });
  assert.equal(deniedAdmin.status, 403);
  const adminRole = await Rol.findOne({ where: { codigo: 'administrador' } });
  assert.ok(adminRole);
  await UsuarioRol.create({ usuario_id: userId, rol_id: adminRole.id });
  const allowedAdmin = await fetch(adminBaseUrl, {
    headers: { Authorization: `Bearer ${response.data.access_token}` },
  });
  assert.equal(allowedAdmin.status, 200);
  await UsuarioRol.destroy({ where: { usuario_id: userId, rol_id: adminRole.id } });
  const roleRemoved = await fetch(adminBaseUrl, {
    headers: { Authorization: `Bearer ${response.data.access_token}` },
  });
  assert.equal(roleRemoved.status, 403);

  const updated = await fetch(`${baseUrl}/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${response.data.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Nombre actualizado', telefono: null }),
  });
  assert.equal(updated.status, 200);
  const updatedBody = await readJson<{ data: Record<string, unknown> }>(updated);
  assert.equal(updatedBody.data.nombre, 'Nombre actualizado');
  const forbiddenUpdate = await fetch(`${baseUrl}/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${response.data.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rol: 'administrador' }),
  });
  assert.equal(forbiddenUpdate.status, 400);

  await Usuario.update({ estado: 'inactivo' }, { where: { id: userId } });
  const inactiveToken = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${response.data.access_token}` } });
  const inactiveLogin = await post('/auth/login', { email, password });
  assert.equal(inactiveToken.status, 401);
  assert.equal(inactiveLogin.status, 401);
});

test('recuperación no enumera cuentas y consume tokens de manera atómica', async () => {
  const email = `recovery-${randomUUID()}@example.invalid`;
  const password = 'contraseña-inicial-3';
  await post('/auth/registro', { nombre: 'Ana', apellido: 'Ejemplo', email, password });
  const known = await post('/auth/recuperacion', { email });
  const unknown = await post('/auth/recuperacion', { email: `ausente-${randomUUID()}@example.invalid` });
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  const knownResponse = await readJson(known);
  assert.deepEqual(knownResponse, await readJson(unknown));
  assert.equal(emails.length, 1);
  const firstEmail = emails[0];
  assert.ok(firstEmail);
  assert.equal(firstEmail.recipient, email);
  assert.equal(firstEmail.token.length, 43);
  assert.equal(firstEmail.expiresAt.getTime() > Date.now(), true);
  const expectedHash = createHash('sha256').update(firstEmail.token).digest('hex');
  const stored = await TokenRecuperacion.findOne({ where: { token_hash: expectedHash } });
  assert.ok(stored);
  assert.notEqual(stored.token_hash, firstEmail.token);
  assert.equal(stored.expira_en.getTime() - Date.now() <= 30 * 60 * 1000, true);

  await post('/auth/recuperacion', { email });
  const secondEmail = emails[1];
  assert.ok(secondEmail);
  const invalidated = await post('/auth/restablecimiento', {
    token: firstEmail.token, password: 'contraseña-nueva-4',
  });
  assert.equal(invalidated.status, 400);
  const reset = await post('/auth/restablecimiento', {
    token: secondEmail.token, password: 'contraseña-nueva-4',
  });
  assert.equal(reset.status, 200);
  const reused = await post('/auth/restablecimiento', {
    token: secondEmail.token, password: 'contraseña-reutilizada-5',
  });
  assert.equal(reused.status, 400);
  assert.equal((await post('/auth/login', { email, password })).status, 401);
  assert.equal((await post('/auth/login', { email, password: 'contraseña-nueva-4' })).status, 200);

  await post('/auth/recuperacion', { email });
  const expiringEmail = emails[2];
  assert.ok(expiringEmail);
  const expiringHash = createHash('sha256').update(expiringEmail.token).digest('hex');
  await TokenRecuperacion.update({ expira_en: new Date(Date.now() - 1000) }, {
    where: { token_hash: expiringHash },
  });
  const expired = await post('/auth/restablecimiento', {
    token: expiringEmail.token, password: 'otra-contraseña-nueva-6',
  });
  assert.equal(expired.status, 400);

  await post('/auth/recuperacion', { email });
  const concurrentEmail = emails[3];
  assert.ok(concurrentEmail);
  const attempts = await Promise.all([
    post('/auth/restablecimiento', { token: concurrentEmail.token, password: 'contraseña-concurrente-7' }),
    post('/auth/restablecimiento', { token: concurrentEmail.token, password: 'contraseña-concurrente-8' }),
  ]);
  assert.deepEqual(attempts.map((attempt) => attempt.status).sort(), [200, 400]);
  const credentials = await Promise.all([
    post('/auth/login', { email, password: 'contraseña-concurrente-7' }),
    post('/auth/login', { email, password: 'contraseña-concurrente-8' }),
  ]);
  assert.deepEqual(credentials.map((credential) => credential.status).sort(), [200, 401]);
});

