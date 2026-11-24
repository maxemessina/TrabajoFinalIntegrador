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

async function postPatient(body: unknown, token?: string): Promise<Response> {
  return fetch(`${baseUrl}/pacientes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function patchPatient(id: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${baseUrl}/pacientes/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function deletePatient(id: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}/pacientes/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function createUserForWrite(active = true) {
  return Usuario.create({
    nombre: 'Alta',
    apellido: 'Prueba',
    email: `alta-${randomUUID()}@example.invalid`,
    password_hash: 'hash-ficticio',
    estado: active ? 'activo' : 'inactivo',
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

test('el paciente edita únicamente su perfil y el administrador puede editar otros', async () => {
  const changed = await patchPatient(ownPatientId, { fecha_nacimiento: '1995-02-10' }, patientToken);
  assert.equal(changed.status, 200);
  const result = await readJson<{ data: Record<string, unknown> }>(changed);
  assert.equal(result.data.id, ownPatientId);
  assert.equal(result.data.fecha_nacimiento, '1995-02-10');
  assert.equal('email' in result.data, false);
  assert.equal((await Paciente.findByPk(ownPatientId))?.fecha_nacimiento, '1995-02-10');

  const cleared = await patchPatient(ownPatientId, { fecha_nacimiento: null }, patientToken);
  assert.equal(cleared.status, 200);
  assert.equal((await readJson<{ data: { fecha_nacimiento: string | null } }>(cleared)).data.fecha_nacimiento, null);
  assert.equal((await Paciente.findByPk(ownPatientId))?.fecha_nacimiento, null);

  const adminUpdate = await patchPatient(unrelatedPatientId, { fecha_nacimiento: '1987-05-01' }, adminToken);
  assert.equal(adminUpdate.status, 200);
  assert.equal((await readJson<{ data: { fecha_nacimiento: string | null } }>(adminUpdate)).data.fecha_nacimiento, '1987-05-01');
  assert.equal((await Paciente.findByPk(unrelatedPatientId))?.fecha_nacimiento, '1987-05-01');
});

test('la edición impide accesos ajenos y rechaza cuerpos o identificadores inválidos', async () => {
  const initial = await Paciente.findByPk(linkedPatientId);
  assert.ok(initial);
  const body = { fecha_nacimiento: '1988-01-01' };
  assert.equal((await patchPatient(linkedPatientId, body)).status, 401);
  assert.equal((await patchPatient(linkedPatientId, body, noRoleToken)).status, 403);
  assert.equal((await patchPatient(linkedPatientId, body, professionalToken)).status, 403);
  assert.equal((await patchPatient(linkedPatientId, body, patientToken)).status, 404);
  assert.equal((await patchPatient(randomUUID(), body, adminToken)).status, 404);
  assert.equal((await patchPatient('invalido', body, adminToken)).status, 400);
  for (const invalidBody of [{}, { fecha_nacimiento: '9999-01-01' }, { nombre: 'Otro' }, { fecha_nacimiento: null, usuario_id: randomUUID() }]) {
    assert.equal((await patchPatient(linkedPatientId, invalidBody, adminToken)).status, 400);
  }
  await initial.reload();
  assert.equal(initial.fecha_nacimiento, '1990-01-01');
});

test('el administrador crea el perfil y asigna el rol en una transacción', async () => {
  const user = await createUserForWrite();
  const response = await postPatient({ usuario_id: user.id, fecha_nacimiento: '1992-05-04' }, adminToken);
  assert.equal(response.status, 201);
  const result = await readJson<{ data: Record<string, unknown> }>(response);
  assert.equal(response.headers.get('location'), `/api/v1/pacientes/${result.data.id}`);
  assert.equal(result.data.usuario_id, user.id);
  assert.equal(result.data.nombre, user.nombre);
  assert.equal(result.data.fecha_nacimiento, '1992-05-04');
  assert.equal(result.data.activo, true);
  assert.equal('email' in result.data, false);
  assert.equal('password_hash' in result.data, false);
  const role = await Rol.findOne({ where: { codigo: 'paciente' } });
  assert.ok(role);
  assert.equal(await Paciente.count({ where: { usuario_id: user.id } }), 1);
  assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id, rol_id: role.id } }), 1);
  assert.equal((await postPatient({ usuario_id: user.id }, adminToken)).status, 409);
});

test('reactivar un perfil conserva la fecha omitida y admite fecha nueva o null', async () => {
  const user = await createUserForWrite();
  const patient = await Paciente.create({ usuario_id: user.id, fecha_nacimiento: '1990-01-01' });
  const role = await Rol.findOne({ where: { codigo: 'paciente' } });
  assert.ok(role);
  const first = await postPatient({ usuario_id: user.id }, adminToken);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('location'), null);
  assert.equal((await readJson<{ data: { id: string; fecha_nacimiento: string | null } }>(first)).data.fecha_nacimiento, '1990-01-01');
  assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id, rol_id: role.id } }), 1);

  await UsuarioRol.destroy({ where: { usuario_id: user.id, rol_id: role.id } });
  const changed = await postPatient({ usuario_id: user.id, fecha_nacimiento: '1980-03-01' }, adminToken);
  assert.equal(changed.status, 200);
  const changedData = await readJson<{ data: { id: string; fecha_nacimiento: string | null } }>(changed);
  assert.equal(changedData.data.id, patient.id);
  assert.equal(changedData.data.fecha_nacimiento, '1980-03-01');

  await UsuarioRol.destroy({ where: { usuario_id: user.id, rol_id: role.id } });
  const cleared = await postPatient({ usuario_id: user.id, fecha_nacimiento: null }, adminToken);
  assert.equal(cleared.status, 200);
  assert.equal((await readJson<{ data: { fecha_nacimiento: string | null } }>(cleared)).data.fecha_nacimiento, null);
  assert.equal(await Paciente.count({ where: { usuario_id: user.id } }), 1);
});

test('el alta rechaza solicitudes sin permiso, inválidas, usuarios inexistentes o inactivos', async () => {
  const user = await createUserForWrite();
  const inactive = await createUserForWrite(false);
  assert.equal((await postPatient({ usuario_id: user.id })).status, 401);
  assert.equal((await postPatient({ usuario_id: user.id }, patientToken)).status, 403);
  assert.equal((await postPatient({ usuario_id: user.id }, professionalToken)).status, 403);
  assert.equal((await postPatient({ usuario_id: 'invalido' }, adminToken)).status, 400);
  assert.equal((await postPatient({ usuario_id: user.id, fecha_nacimiento: '9999-01-01' }, adminToken)).status, 400);
  assert.equal((await postPatient({ usuario_id: user.id, rol: 'administrador' }, adminToken)).status, 400);
  assert.equal((await postPatient({ usuario_id: randomUUID() }, adminToken)).status, 404);
  assert.equal((await postPatient({ usuario_id: inactive.id }, adminToken)).status, 409);
  assert.equal(await Paciente.count({ where: { usuario_id: user.id } }), 0);
  assert.equal(await Paciente.count({ where: { usuario_id: inactive.id } }), 0);
});

test('altas concurrentes del mismo usuario no duplican el perfil ni el rol', async () => {
  const user = await createUserForWrite();
  const responses = await Promise.all([
    postPatient({ usuario_id: user.id }, adminToken),
    postPatient({ usuario_id: user.id }, adminToken),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const role = await Rol.findOne({ where: { codigo: 'paciente' } });
  assert.ok(role);
  assert.equal(await Paciente.count({ where: { usuario_id: user.id } }), 1);
  assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id, rol_id: role.id } }), 1);
});

test('un fallo al asignar el rol revierte la creación o modificación del perfil', async () => {
  const user = await createUserForWrite();
  await database.query(`
    CREATE FUNCTION fail_patient_role_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.usuario_id = '${user.id}'::uuid THEN
        RAISE EXCEPTION 'fallo de prueba';
      END IF;
      RETURN NEW;
    END $$`);
  await database.query(`
    CREATE TRIGGER fail_patient_role_assignment
    BEFORE INSERT ON usuario_roles
    FOR EACH ROW EXECUTE FUNCTION fail_patient_role_assignment()`);
  try {
    const response = await postPatient({ usuario_id: user.id }, adminToken);
    assert.equal(response.status, 500);
    assert.equal(await Paciente.count({ where: { usuario_id: user.id } }), 0);
    assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id } }), 0);
    const patient = await Paciente.create({ usuario_id: user.id, fecha_nacimiento: '1990-01-01' });
    const reactivation = await postPatient({ usuario_id: user.id, fecha_nacimiento: '1980-01-01' }, adminToken);
    assert.equal(reactivation.status, 500);
    await patient.reload();
    assert.equal(patient.fecha_nacimiento, '1990-01-01');
    assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id } }), 0);
  } finally {
    await database.query('DROP TRIGGER fail_patient_role_assignment ON usuario_roles');
    await database.query('DROP FUNCTION fail_patient_role_assignment()');
  }
});

test('solo el administrador puede dar de baja y se validan los identificadores', async () => {
  assert.equal((await deletePatient(ownPatientId)).status, 401);
  assert.equal((await deletePatient(ownPatientId, patientToken)).status, 403);
  assert.equal((await deletePatient(ownPatientId, professionalToken)).status, 403);
  assert.equal((await deletePatient(ownPatientId, noRoleToken)).status, 403);
  assert.equal((await deletePatient('invalido', adminToken)).status, 400);
  assert.equal((await deletePatient(randomUUID(), adminToken)).status, 404);
  const role = await Rol.findOne({ where: { codigo: 'paciente' } });
  assert.ok(role);
  const patient = await Paciente.findByPk(ownPatientId);
  assert.ok(patient);
  assert.equal(await UsuarioRol.count({ where: { usuario_id: patient.usuario_id, rol_id: role.id } }), 1);
});

test('la baja conserva el perfil, desactiva al usuario sin otros roles y es idempotente', async () => {
  const user = await createUserForWrite();
  const role = await Rol.findOne({ where: { codigo: 'paciente' } });
  assert.ok(role);
  const patient = await Paciente.create({ usuario_id: user.id, fecha_nacimiento: '1980-01-01' });
  await UsuarioRol.create({ usuario_id: user.id, rol_id: role.id });
  const token = await accessTokens.issue(user.id);
  const deleted = await deletePatient(patient.id, adminToken);
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id, rol_id: role.id } }), 0);
  assert.equal((await Usuario.findByPk(user.id))?.estado, 'inactivo');
  assert.equal((await Paciente.findByPk(patient.id))?.fecha_nacimiento, '1980-01-01');
  assert.equal((await get(`/pacientes/${patient.id}`, token)).status, 401);
  assert.equal((await deletePatient(patient.id, adminToken)).status, 204);

  await user.reload();
  await user.update({ estado: 'activo' });
  const reactivated = await postPatient({ usuario_id: user.id }, adminToken);
  assert.equal(reactivated.status, 200);
  const result = await readJson<{ data: { id: string; activo: boolean; fecha_nacimiento: string | null } }>(reactivated);
  assert.equal(result.data.id, patient.id);
  assert.equal(result.data.activo, true);
  assert.equal(result.data.fecha_nacimiento, '1980-01-01');
});

test('la baja de un usuario multirrol conserva sus otros roles y marca inactivo el perfil', async () => {
  const user = await createUserForWrite();
  const search = `SinRolPaciente${randomUUID().replaceAll('-', '')}`;
  await user.update({ nombre: search });
  const patient = await Paciente.create({ usuario_id: user.id, fecha_nacimiento: null });
  const patientRole = await Rol.findOne({ where: { codigo: 'paciente' } });
  const adminRole = await Rol.findOne({ where: { codigo: 'administrador' } });
  assert.ok(patientRole);
  assert.ok(adminRole);
  await UsuarioRol.bulkCreate([
    { usuario_id: user.id, rol_id: patientRole.id },
    { usuario_id: user.id, rol_id: adminRole.id },
  ]);
  const userToken = await accessTokens.issue(user.id);
  assert.equal((await deletePatient(patient.id, adminToken)).status, 204);
  assert.equal((await Usuario.findByPk(user.id))?.estado, 'activo');
  assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id, rol_id: adminRole.id } }), 1);
  const me = await get('/me', userToken);
  assert.equal(me.status, 200);
  assert.deepEqual((await readJson<{ data: { roles: string[] } }>(me)).data.roles, ['administrador']);
  const detail = await get(`/pacientes/${patient.id}`, adminToken);
  assert.equal((await readJson<{ data: { activo: boolean } }>(detail)).data.activo, false);
  const active = await get(`/pacientes?q=${search}&activo=true`, adminToken);
  const inactive = await get(`/pacientes?q=${search}&activo=false`, adminToken);
  assert.equal((await readJson<{ meta: { total: number } }>(active)).meta.total, 0);
  const inactiveResult = await readJson<{ data: Array<{ id: string; activo: boolean }>; meta: { total: number } }>(inactive);
  assert.equal(inactiveResult.meta.total, 1);
  assert.deepEqual(inactiveResult.data.map(({ id, activo }) => ({ id, activo })), [{ id: patient.id, activo: false }]);
  const reactivated = await postPatient({ usuario_id: user.id }, adminToken);
  assert.equal(reactivated.status, 200);
  assert.equal((await readJson<{ data: { activo: boolean } }>(reactivated)).data.activo, true);
});

test('la baja rechaza turnos reservados pendientes y conserva los turnos históricos', async () => {
  const user = await createUserForWrite();
  const role = await Rol.findOne({ where: { codigo: 'paciente' } });
  const professional = await Profesional.findOne();
  assert.ok(role);
  assert.ok(professional);
  const patient = await Paciente.create({ usuario_id: user.id, fecha_nacimiento: null });
  await UsuarioRol.create({ usuario_id: user.id, rol_id: role.id });
  const now = Date.now();
  await Turno.create({
    paciente_id: patient.id, profesional_id: professional.id, estado: 'reservado', cancelado_en: null,
    inicio: new Date(now - 2 * 60 * 60 * 1000), fin: new Date(now - 60 * 60 * 1000),
  });
  const pending = await Turno.create({
    paciente_id: patient.id, profesional_id: professional.id, estado: 'reservado', cancelado_en: null,
    inicio: new Date(now - 10 * 60 * 1000), fin: new Date(now + 10 * 60 * 1000),
  });
  assert.equal((await deletePatient(patient.id, adminToken)).status, 409);
  assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id, rol_id: role.id } }), 1);
  assert.equal((await Usuario.findByPk(user.id))?.estado, 'activo');
  await pending.update({ estado: 'atendido' });
  assert.equal((await deletePatient(patient.id, adminToken)).status, 204);
  assert.equal(await Turno.count({ where: { paciente_id: patient.id } }), 2);
  assert.ok(await Paciente.findByPk(patient.id));
});

test('bajas concurrentes son idempotentes', async () => {
  const user = await createUserForWrite();
  const role = await Rol.findOne({ where: { codigo: 'paciente' } });
  assert.ok(role);
  const patient = await Paciente.create({ usuario_id: user.id, fecha_nacimiento: null });
  await UsuarioRol.create({ usuario_id: user.id, rol_id: role.id });
  const responses = await Promise.all([
    deletePatient(patient.id, adminToken),
    deletePatient(patient.id, adminToken),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [204, 204]);
  assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id, rol_id: role.id } }), 0);
  assert.equal((await Usuario.findByPk(user.id))?.estado, 'inactivo');
});

test('un fallo al desactivar el usuario revierte la baja del rol', async () => {
  const user = await createUserForWrite();
  const role = await Rol.findOne({ where: { codigo: 'paciente' } });
  assert.ok(role);
  const patient = await Paciente.create({ usuario_id: user.id, fecha_nacimiento: null });
  await UsuarioRol.create({ usuario_id: user.id, rol_id: role.id });
  await database.query(`
    CREATE FUNCTION fail_patient_deactivation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.id = '${user.id}'::uuid AND NEW.estado = 'inactivo' THEN
        RAISE EXCEPTION 'fallo de prueba';
      END IF;
      RETURN NEW;
    END $$`);
  await database.query(`
    CREATE TRIGGER fail_patient_deactivation
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fail_patient_deactivation()`);
  try {
    assert.equal((await deletePatient(patient.id, adminToken)).status, 500);
    assert.equal(await UsuarioRol.count({ where: { usuario_id: user.id, rol_id: role.id } }), 1);
    assert.equal((await Usuario.findByPk(user.id))?.estado, 'activo');
  } finally {
    await database.query('DROP TRIGGER fail_patient_deactivation ON usuarios');
    await database.query('DROP FUNCTION fail_patient_deactivation()');
  }
});
