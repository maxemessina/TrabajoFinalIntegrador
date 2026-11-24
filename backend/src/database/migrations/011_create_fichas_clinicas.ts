import { DataTypes, literal } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createFichasClinicas(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.createTable('fichas_clinicas', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    paciente_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'pacientes', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    profesional_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'profesionales', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.addConstraint('fichas_clinicas', {
    fields: ['paciente_id', 'profesional_id'], type: 'unique',
    name: 'fichas_clinicas_paciente_profesional_unico', transaction,
  });
}
