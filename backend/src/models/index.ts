import type { Sequelize } from 'sequelize';
import { defineEspecialidad } from './Especialidad.ts';
import { definePaciente } from './Paciente.ts';
import { defineRol } from './Rol.ts';
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

  return { Usuario, Rol, UsuarioRol, Paciente, Zona, Especialidad };
}
