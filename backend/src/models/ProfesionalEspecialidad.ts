import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineProfesionalEspecialidad(database: Sequelize) {
  class ProfesionalEspecialidad extends Model<InferAttributes<ProfesionalEspecialidad>, InferCreationAttributes<ProfesionalEspecialidad>> {
    declare profesional_id: string;
    declare especialidad_id: string;
    declare creado_en: CreationOptional<Date>;
  }

  ProfesionalEspecialidad.init({
    profesional_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    especialidad_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'ProfesionalEspecialidad',
    tableName: 'profesional_especialidades',
    createdAt: 'creado_en',
    updatedAt: false,
  });

  return ProfesionalEspecialidad;
}
