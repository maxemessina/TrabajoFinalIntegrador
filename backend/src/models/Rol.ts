import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export type CodigoRol = 'paciente' | 'profesional' | 'administrador';

export function defineRol(database: Sequelize) {
  class Rol extends Model<InferAttributes<Rol>, InferCreationAttributes<Rol>> {
    declare id: number;
    declare codigo: CodigoRol;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  Rol.init({
    id: { type: DataTypes.SMALLINT, allowNull: false, primaryKey: true },
    codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'Rol',
    tableName: 'roles',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return Rol;
}
