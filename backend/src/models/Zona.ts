import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineZona(database: Sequelize) {
  class Zona extends Model<InferAttributes<Zona>, InferCreationAttributes<Zona>> {
    declare id: CreationOptional<string>;
    declare nombre: string;
    declare provincia: string;
    declare activa: CreationOptional<boolean>;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  Zona.init({
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: literal('gen_random_uuid()'),
    },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    provincia: { type: DataTypes.STRING(100), allowNull: false },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'Zona',
    tableName: 'zonas',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return Zona;
}
