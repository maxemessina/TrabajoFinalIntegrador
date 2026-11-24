import { DataTypes, literal, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineTokenRecuperacion(database: Sequelize) {
  class TokenRecuperacion extends Model<InferAttributes<TokenRecuperacion>, InferCreationAttributes<TokenRecuperacion>> {
    declare id: CreationOptional<string>;
    declare usuario_id: string;
    declare token_hash: string;
    declare expira_en: Date;
    declare usado_en: Date | null;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  TokenRecuperacion.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    usuario_id: { type: DataTypes.UUID, allowNull: false },
    token_hash: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    expira_en: { type: DataTypes.DATE, allowNull: false },
    usado_en: { type: DataTypes.DATE, allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'TokenRecuperacion',
    tableName: 'tokens_recuperacion',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return TokenRecuperacion;
}
