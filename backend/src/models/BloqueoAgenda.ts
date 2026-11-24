import { DataTypes, literal, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineBloqueoAgenda(database: Sequelize) {
  class BloqueoAgenda extends Model<InferAttributes<BloqueoAgenda>, InferCreationAttributes<BloqueoAgenda>> {
    declare id: CreationOptional<string>;
    declare profesional_id: string;
    declare inicio: Date;
    declare fin: Date;
    declare motivo: string | null;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  BloqueoAgenda.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    profesional_id: { type: DataTypes.UUID, allowNull: false },
    inicio: { type: DataTypes.DATE, allowNull: false },
    fin: { type: DataTypes.DATE, allowNull: false },
    motivo: { type: DataTypes.STRING(255), allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'BloqueoAgenda',
    tableName: 'bloqueos_agenda',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return BloqueoAgenda;
}
