import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { Sequelize } from 'sequelize';
import { createApp } from '../../src/app.ts';
import { createAccessTokenService } from '../../src/services/access-token.service.ts';
import { readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { defineModels } from '../../src/models/index.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const databaseUrl = readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL });
const schema = `pacientes_test_${randomUUID().replaceAll('-', '')}`;
const databaseOptions = { logging: false, dialectOptions: { options: `-c search_path=${schema},public` } };
const adminDatabase = new Sequelize(databaseUrl, { logging: false });
const database = new Sequelize(databaseUrl, databaseOptions);
const authDatabase = new Sequelize(databaseUrl, databaseOptions);
const models = defineModels(database);
const { Usuario, Rol, UsuarioRol, Paciente, Zona, Profesional, Turno } = models;
const jwtSecret = 'patients-test-secret-with-more-than-32-random-looking-bytes';
const accessTokens = createAccessTokenService(jwtSecret);
let server: Server;
let baseUrl: string;
let schemaCreated = false;
let adminToken: string;
let patientToken: string;
let professionalToken: string;
let noRoleToken: string;
let ownPatientId: string;
let linkedPatientId: string;
let cancelledPatientId: string;
let unrelatedPatientId: string;

before(async () => {
  await runMigrations(adminDatabase);
  await adminDatabase.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  await adminDatabase.query(
    `CREATE TABLE "${schema}".schema_migrations (nombre varchar(255) PRIMARY KEY, ejecutada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  await runMigrations(database);

  async function createUser(name: string, roles: Array<'paciente' | 'profesional' | 'administrador'> = [], active = true) {
    const user = await Usuario.create({
      nombre: name,
      apellido: name.split(' ')[1] ?? 'Test',
      email: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`,
      password_hash: 'hash-ficticio',
      estado: active ? 'activo' : 'inactivo',
    });
    for (const code of roles) {
      const role = await Rol.findOne({ where: { codigo: code } });
      assert.ok(role);
      await UsuarioRol.create({ usuario_id: user.id, rol_id: role.id });
    }
    return user;
  }

  async function createPatient(surname: string, active = true, birthDate: string | null = '1990-01-01') {
    const user = await createUser(`Paciente ${surname}`, ['paciente'], active);
    const patient = await Paciente.create({
      usuario_id: user.id,
      fecha_nacimiento: birthDate,
    });
    return { user, patient };
  }

  const admin = await createUser('Admin Principal', ['administrador']);
  const own = await createPatient('Alpha');
  const linked = await createPatient('Beta');
  const cancelled = await createPatient('Cancelled');
  const unrelated = await createPatient('Delta', true, null);
  await createPatient('Inactive', false);
  const professionalUser = await createUser('Profesional Actual', ['profesional']);
  const zone = await Zona.create({ nombre: `Zona ${randomUUID()}`, provincia: 'Buenos Aires' });
  const professional = await Profesional.create({
    usuario_id: professionalUser.id,
    zona_id: zone.id,
    matricula: `MAT-${randomUUID()}`,
    direccion_atencion: 'Dirección ficticia',
    duracion_consulta_min: 30,
  });
  await Turno.create({
    paciente_id: linked.patient.id,
    profesional_id: professional.id,
    inicio: new Date('2026-01-01T10:00:00Z'),
    fin: new Date('2026-01-01T10:30:00Z'),
    estado: 'atendido',
    cancelado_en: null,
  });
  await Turno.create({
    paciente_id: cancelled.patient.id,
    profesional_id: professional.id,
    inicio: new Date('2026-01-01T11:00:00Z'),
    fin: new Date('2026-01-01T11:30:00Z'),
    estado: 'cancelado',
    cancelado_en: new Date('2025-12-01T10:00:00Z'),
  });
  const patientWithoutRole = await createUser('Sin Rol');

  adminToken = await accessTokens.issue(admin.id);
  patientToken = await accessTokens.issue(own.user.id);
  professionalToken = await accessTokens.issue(professionalUser.id);
  noRoleToken = await accessTokens.issue(patientWithoutRole.id);
  ownPatientId = own.patient.id;
  linkedPatientId = linked.patient.id;
  cancelledPatientId = cancelled.patient.id;
  unrelatedPatientId = unrelated.patient.id;

  const app = createApp(
    { corsOrigin: 'http://localhost:5173' },
    { database: authDatabase, jwtSecret },
  );
  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('El servidor de prueba no tiene un puerto TCP');
  }
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

after(async () => {
  try {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
    }
    await Promise.all([database.close(), authDatabase.close()]);
    if (schemaCreated) {
      await adminDatabase.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  } finally {
    await adminDatabase.close();
  }
});

async function get(path: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

test('la lista cuenta filtros antes de paginar y ordena con desempate estable', async () => {
  const response = await get('/pacientes?q=Paciente&activo=true&page=1&limit=2&sortBy=apellido&order=asc', adminToken);
  assert.equal(response.status, 200);
  const result = await readJson<{
    data: Array<Record<string, unknown>>;
    meta: { page: number; limit: number; total: number; totalPages: number };
  }>(response);
  assert.equal(result.meta.total, 4);
  assert.equal(result.meta.totalPages, 2);
  assert.equal(result.data.length, 2);
  assert.deepEqual(result.data.map((patient) => patient.apellido), ['Alpha', 'Beta']);
  assert.equal('email' in (result.data[0] ?? {}), false);
  assert.equal('telefono' in (result.data[0] ?? {}), false);

  const secondPage = await get('/pacientes?q=Paciente&activo=true&page=2&limit=2&sortBy=apellido', adminToken);
  const secondPageResult = await readJson<{ data: Array<Record<string, unknown>> }>(secondPage);
  assert.deepEqual(secondPageResult.data.map((patient) => patient.apellido), ['Cancelled', 'Delta']);

  const inactive = await get('/pacientes?activo=false', adminToken);
  const inactiveResult = await readJson<{ data: Array<Record<string, unknown>>; meta: { total: number } }>(inactive);
  assert.equal(inactiveResult.meta.total, 1);
  assert.equal(inactiveResult.data[0]?.activo, false);

  const empty = await get('/pacientes?q=sin-resultados', adminToken);
  const emptyResult = await readJson<{ data: unknown[]; meta: { total: number; totalPages: number } }>(empty);
  assert.deepEqual(emptyResult, { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });

  const wildcard = await get('/pacientes?q=%25', adminToken);
  const wildcardResult = await readJson<{ meta: { total: number } }>(wildcard);
  assert.equal(wildcardResult.meta.total, 0);

  const nullBirthDate = await get('/pacientes?q=Paciente&sortBy=fecha_nacimiento&order=desc&limit=100', adminToken);
  const nullBirthDateResult = await readJson<{ data: Array<Record<string, unknown>> }>(nullBirthDate);
  assert.equal(nullBirthDateResult.data.at(-1)?.apellido, 'Delta');
  assert.equal(nullBirthDateResult.data.at(-1)?.fecha_nacimiento, null);
});

test('pacientes solo consultan su propio perfil y los identificadores ajenos se ocultan', async () => {
  const list = await get('/pacientes', patientToken);
  assert.equal(list.status, 200);
  const listResult = await readJson<{ data: Array<Record<string, unknown>>; meta: { total: number } }>(list);
  assert.equal(listResult.meta.total, 1);
  assert.equal(listResult.data[0]?.id, ownPatientId);

  const own = await get(`/pacientes/${ownPatientId}`, patientToken);
  assert.equal(own.status, 200);
  const ownResult = await readJson<{ data: Record<string, unknown> }>(own);
  assert.equal(ownResult.data.id, ownPatientId);
  assert.equal('email' in ownResult.data, false);

  const other = await get(`/pacientes/${unrelatedPatientId}`, patientToken);
  assert.equal(other.status, 404);
  assert.equal((await get('/pacientes/22222222-2222-4222-8222-222222222222', adminToken)).status, 404);
  const invalidId = await get('/pacientes/no-es-uuid', patientToken);
  assert.equal(invalidId.status, 400);
});

test('profesionales solo consultan pacientes con turno no cancelado compartido', async () => {
  const list = await get('/pacientes', professionalToken);
  assert.equal(list.status, 200);
  const result = await readJson<{ data: Array<Record<string, unknown>>; meta: { total: number } }>(list);
  assert.equal(result.meta.total, 1);
  assert.equal(result.data[0]?.id, linkedPatientId);
  assert.equal((await get(`/pacientes/${linkedPatientId}`, professionalToken)).status, 200);
  assert.equal((await get(`/pacientes/${cancelledPatientId}`, professionalToken)).status, 404);
});

test('la autenticación y los roles distinguen 401 de 403', async () => {
  assert.equal((await get('/pacientes')).status, 401);
  assert.equal((await get('/pacientes', noRoleToken)).status, 403);
});
