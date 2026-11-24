import { QueryTypes } from 'sequelize';
import type { Sequelize, Transaction } from 'sequelize';
import { defineModels } from '../../models/index.ts';

const seedName = 'demo_v1';

export async function seedDemo(database: Sequelize, transaction: Transaction): Promise<boolean> {
  await database.query('SELECT pg_advisory_xact_lock(1346851657, 5)', { transaction });
  await database.query(
    'CREATE TABLE IF NOT EXISTS schema_seeds (nombre varchar(255) PRIMARY KEY, ejecutada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    { transaction },
  );
  const applied = await database.query<{ nombre: string }>(
    'SELECT nombre FROM schema_seeds WHERE nombre = :nombre',
    { replacements: { nombre: seedName }, type: QueryTypes.SELECT, transaction },
  );
  if (applied.length > 0) {
    return false;
  }

  const {
    Usuario, Rol, UsuarioRol, Paciente, Zona, Especialidad, Profesional, ProfesionalEspecialidad,
    TrabajoProfesional, HorarioAtencion, BloqueoAgenda, Turno, FichaClinica, NotaClinica,
  } = defineModels(database);
  const roles = await Rol.findAll({ where: { codigo: ['paciente', 'profesional', 'administrador'] }, transaction });
  const roleIds = new Map(roles.map((role) => [role.codigo, role.id]));
  const patientRole = roleIds.get('paciente');
  const professionalRole = roleIds.get('profesional');
  const adminRole = roleIds.get('administrador');
  if (patientRole === undefined || professionalRole === undefined || adminRole === undefined) {
    throw new Error('Faltan los roles del sistema; aplicá las migraciones antes de cargar datos demo');
  }

  const userDefaults = { password_hash: '!demo-sin-acceso!', estado: 'inactivo' as const };
  const patientUser = await Usuario.create({
    ...userDefaults, nombre: 'Paciente', apellido: 'Demo', email: 'paciente@ejemplo.invalid',
  }, { transaction });
  const professionalUser = await Usuario.create({
    ...userDefaults, nombre: 'Profesional', apellido: 'Demo', email: 'profesional@ejemplo.invalid',
  }, { transaction });
  const adminUser = await Usuario.create({
    ...userDefaults, nombre: 'Administrador', apellido: 'Demo', email: 'admin@ejemplo.invalid',
  }, { transaction });
  await UsuarioRol.bulkCreate([
    { usuario_id: patientUser.id, rol_id: patientRole },
    { usuario_id: professionalUser.id, rol_id: professionalRole },
    { usuario_id: adminUser.id, rol_id: adminRole },
  ], { transaction });
  const zone = await Zona.create({ nombre: 'Zona demo', provincia: 'Provincia demo' }, { transaction });
  const specialty = await Especialidad.create({ nombre: 'Especialidad demo' }, { transaction });
  const patient = await Paciente.create({ usuario_id: patientUser.id, fecha_nacimiento: '1990-01-01' }, { transaction });
  const professional = await Profesional.create({
    usuario_id: professionalUser.id, zona_id: zone.id, matricula: 'DEMO-0001',
    direccion_atencion: 'Direccion ficticia', duracion_consulta_min: 30,
  }, { transaction });
  await ProfesionalEspecialidad.create({ profesional_id: professional.id, especialidad_id: specialty.id }, { transaction });
  await TrabajoProfesional.create({
    profesional_id: professional.id, titulo: 'Trabajo de demostracion', descripcion: 'Contenido ficticio.',
  }, { transaction });
  await HorarioAtencion.create({
    profesional_id: professional.id, dia_semana: 1, hora_inicio: '09:00', hora_fin: '12:00', vigente_desde: '2025-01-01',
  }, { transaction });
  await BloqueoAgenda.create({
    profesional_id: professional.id, inicio: new Date('2025-11-03T13:00:00Z'),
    fin: new Date('2025-11-03T13:30:00Z'), motivo: 'Bloqueo ficticio',
  }, { transaction });
  const titulares = { paciente_id: patient.id, profesional_id: professional.id };
  const appointment = await Turno.create({
    ...titulares, inicio: new Date('2025-11-03T12:00:00Z'),
    fin: new Date('2025-11-03T12:30:00Z'), estado: 'atendido',
  }, { transaction });
  const record = await FichaClinica.create(titulares, { transaction });
  await NotaClinica.create({
    ...titulares, ficha_id: record.id, turno_id: appointment.id,
    contenido: 'Nota de demostracion sin datos clinicos reales.',
  }, { transaction });
  await database.query('INSERT INTO schema_seeds (nombre) VALUES (:nombre)', {
    replacements: { nombre: seedName }, transaction,
  });
  return true;
}
