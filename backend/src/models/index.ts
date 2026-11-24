import type { Sequelize } from 'sequelize';
import { defineBloqueoAgenda } from './BloqueoAgenda.ts';
import { defineEspecialidad } from './Especialidad.ts';
import { defineEventoVisita } from './EventoVisita.ts';
import { defineFichaClinica } from './FichaClinica.ts';
import { defineHorarioAtencion } from './HorarioAtencion.ts';
import { defineNotificacion } from './Notificacion.ts';
import { definePaciente } from './Paciente.ts';
import { defineProfesional } from './Profesional.ts';
import { defineProfesionalEspecialidad } from './ProfesionalEspecialidad.ts';
import { defineRol } from './Rol.ts';
import { defineTokenRecuperacion } from './TokenRecuperacion.ts';
import { defineTrabajoProfesional } from './TrabajoProfesional.ts';
import { defineTurno } from './Turno.ts';
import { defineUsuario } from './Usuario.ts';
import { defineUsuarioRol } from './UsuarioRol.ts';
import { defineZona } from './Zona.ts';

export function defineModels(database: Sequelize) {
  const Usuario = defineUsuario(database);
  const Rol = defineRol(database);
  const UsuarioRol = defineUsuarioRol(database);
  const Paciente = definePaciente(database);
  const Zona = defineZona(database);
  const Especialidad = defineEspecialidad(database);
  const Profesional = defineProfesional(database);
  const ProfesionalEspecialidad = defineProfesionalEspecialidad(database);
  const TrabajoProfesional = defineTrabajoProfesional(database);
  const HorarioAtencion = defineHorarioAtencion(database);
  const BloqueoAgenda = defineBloqueoAgenda(database);
  const TokenRecuperacion = defineTokenRecuperacion(database);
  const EventoVisita = defineEventoVisita(database);
  const Turno = defineTurno(database);
  const Notificacion = defineNotificacion(database);
  const FichaClinica = defineFichaClinica(database);

  Usuario.belongsToMany(Rol, {
    as: 'roles',
    through: UsuarioRol,
    foreignKey: 'usuario_id',
    otherKey: 'rol_id',
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  });
  Rol.belongsToMany(Usuario, {
    as: 'usuarios',
    through: UsuarioRol,
    foreignKey: 'rol_id',
    otherKey: 'usuario_id',
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  });

  Usuario.hasOne(Paciente, {
    as: 'paciente',
    foreignKey: 'usuario_id',
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  });
  Paciente.belongsTo(Usuario, {
    as: 'usuario',
    foreignKey: 'usuario_id',
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  });

  Usuario.hasOne(Profesional, {
    as: 'profesional', foreignKey: 'usuario_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Profesional.belongsTo(Usuario, {
    as: 'usuario', foreignKey: 'usuario_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Zona.hasMany(Profesional, {
    as: 'profesionales', foreignKey: 'zona_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Profesional.belongsTo(Zona, {
    as: 'zona', foreignKey: 'zona_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Profesional.belongsToMany(Especialidad, {
    as: 'especialidades', through: ProfesionalEspecialidad, foreignKey: 'profesional_id',
    otherKey: 'especialidad_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Especialidad.belongsToMany(Profesional, {
    as: 'profesionales', through: ProfesionalEspecialidad, foreignKey: 'especialidad_id',
    otherKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Profesional.hasMany(TrabajoProfesional, {
    as: 'trabajos', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  TrabajoProfesional.belongsTo(Profesional, {
    as: 'profesional', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Profesional.hasMany(HorarioAtencion, {
    as: 'horarios', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  HorarioAtencion.belongsTo(Profesional, {
    as: 'profesional', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Profesional.hasMany(BloqueoAgenda, {
    as: 'bloqueos', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  BloqueoAgenda.belongsTo(Profesional, {
    as: 'profesional', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Usuario.hasMany(TokenRecuperacion, {
    as: 'tokensRecuperacion', foreignKey: 'usuario_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  TokenRecuperacion.belongsTo(Usuario, {
    as: 'usuario', foreignKey: 'usuario_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Usuario.hasMany(EventoVisita, {
    as: 'eventosVisita', foreignKey: 'usuario_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  EventoVisita.belongsTo(Usuario, {
    as: 'usuario', foreignKey: 'usuario_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Profesional.hasMany(EventoVisita, {
    as: 'eventosVisita', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  EventoVisita.belongsTo(Profesional, {
    as: 'profesional', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Paciente.hasMany(Turno, {
    as: 'turnos', foreignKey: 'paciente_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Turno.belongsTo(Paciente, {
    as: 'paciente', foreignKey: 'paciente_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Profesional.hasMany(Turno, {
    as: 'turnos', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Turno.belongsTo(Profesional, {
    as: 'profesional', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Turno.hasMany(Notificacion, {
    as: 'notificaciones', foreignKey: 'turno_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Notificacion.belongsTo(Turno, {
    as: 'turno', foreignKey: 'turno_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Paciente.hasMany(FichaClinica, {
    as: 'fichasClinicas', foreignKey: 'paciente_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  FichaClinica.belongsTo(Paciente, {
    as: 'paciente', foreignKey: 'paciente_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  Profesional.hasMany(FichaClinica, {
    as: 'fichasClinicas', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });
  FichaClinica.belongsTo(Profesional, {
    as: 'profesional', foreignKey: 'profesional_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
  });

  return {
    Usuario, Rol, UsuarioRol, Paciente, Zona, Especialidad, Profesional, ProfesionalEspecialidad, TrabajoProfesional,
    HorarioAtencion, BloqueoAgenda, TokenRecuperacion, EventoVisita, Turno, Notificacion, FichaClinica,
  };
}
