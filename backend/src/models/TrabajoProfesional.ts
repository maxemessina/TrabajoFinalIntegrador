import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineTrabajoProfesional(database: Sequelize) {
  class TrabajoProfesional extends Model<InferAttributes<TrabajoProfesional>, InferCreationAttributes<TrabajoProfesional>> {
    declare id: CreationOptional<string>;
    declare profesional_id: string;
    declare titulo: string;
    declare descripcion: string | null;
    declare imagen_url: string | null;
    declare visible: CreationOptional<boolean>;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  TrabajoProfesional.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    profesional_id: { type: DataTypes.UUID, allowNull: false },
    titulo: { type: DataTypes.STRING(150), allowNull: false },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    imagen_url: { type: DataTypes.TEXT, allowNull: true },
    visible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'TrabajoProfesional',
    tableName: 'trabajos_profesional',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return TrabajoProfesional;
}
