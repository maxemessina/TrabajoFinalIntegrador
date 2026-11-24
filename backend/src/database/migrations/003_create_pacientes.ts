import { DataTypes, literal, Op } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createPacientes(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.createTable('pacientes', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: literal('gen_random_uuid()'),
    },
    usuario_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    },
    fecha_nacimiento: { type: DataTypes.DATEONLY, allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });

  await queryInterface.addConstraint('pacientes', {
    fields: ['fecha_nacimiento'],
    type: 'check',
    name: 'pacientes_fecha_nacimiento_check',
    where: { fecha_nacimiento: { [Op.lte]: literal('CURRENT_DATE') } },
    transaction,
  });
}
