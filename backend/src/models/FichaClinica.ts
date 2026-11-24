import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineFichaClinica(database: Sequelize) {
  class FichaClinica extends Model<InferAttributes<FichaClinica>, InferCreationAttributes<FichaClinica>> {
    declare id: CreationOptional<string>;
    declare paciente_id: string;
    declare profesional_id: string;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  FichaClinica.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    paciente_id: { type: DataTypes.UUID, allowNull: false },
    profesional_id: { type: DataTypes.UUID, allowNull: false },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'FichaClinica',
    tableName: 'fichas_clinicas',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return FichaClinica;
}
