import { DataTypes, literal, Op } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createUsuarios(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.createTable('usuarios', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
    },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    apellido: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(254), allowNull: false },
    password_hash: { type: DataTypes.TEXT, allowNull: false },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'activo' },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });

  await queryInterface.addConstraint('usuarios', {
    fields: ['estado'],
    type: 'check',
    name: 'usuarios_estado_check',
    where: { estado: { [Op.in]: ['activo', 'inactivo'] } },
    transaction,
  });

  await queryInterface.sequelize.query(
    'CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email))',
    { transaction },
  );
}
