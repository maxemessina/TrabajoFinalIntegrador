import { DataTypes, literal, Op } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createRoles(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.createTable('roles', {
    id: { type: DataTypes.SMALLINT, primaryKey: true, allowNull: false },
    codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });

  await queryInterface.addConstraint('roles', {
    fields: ['codigo'],
    type: 'check',
    name: 'roles_codigo_check',
    where: { codigo: { [Op.in]: ['paciente', 'profesional', 'administrador'] } },
    transaction,
  });

  await queryInterface.bulkInsert('roles', [
    { id: 1, codigo: 'paciente' },
    { id: 2, codigo: 'profesional' },
    { id: 3, codigo: 'administrador' },
  ], { transaction });

  await queryInterface.createTable('usuario_roles', {
    usuario_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    },
    rol_id: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      primaryKey: true,
      references: { model: 'roles', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });

  await queryInterface.addIndex('usuario_roles', ['rol_id'], {
    name: 'usuario_roles_rol_id_idx',
    transaction,
  });
}
