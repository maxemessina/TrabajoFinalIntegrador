import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineEspecialidad(database: Sequelize) {
  class Especialidad extends Model<InferAttributes<Especialidad>, InferCreationAttributes<Especialidad>> {
    declare id: CreationOptional<string>;
    declare nombre: string;
    declare activa: CreationOptional<boolean>;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  Especialidad.init({
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: literal('gen_random_uuid()'),
    },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'Especialidad',
    tableName: 'especialidades',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return Especialidad;
}
