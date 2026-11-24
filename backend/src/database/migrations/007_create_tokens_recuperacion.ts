import { DataTypes, literal } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createTokensRecuperacion(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.createTable('tokens_recuperacion', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    usuario_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'usuarios', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    token_hash: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    expira_en: { type: DataTypes.DATE, allowNull: false },
    usado_en: { type: DataTypes.DATE, allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.addIndex('tokens_recuperacion', ['usuario_id'], {
    name: 'tokens_recuperacion_usuario_id_idx', transaction,
  });
}
