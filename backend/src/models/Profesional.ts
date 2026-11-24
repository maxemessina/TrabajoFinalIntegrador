import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineProfesional(database: Sequelize) {
  class Profesional extends Model<InferAttributes<Profesional>, InferCreationAttributes<Profesional>> {
    declare id: CreationOptional<string>;
    declare usuario_id: string;
    declare zona_id: string;
    declare matricula: string;
    declare descripcion: string | null;
    declare direccion_atencion: string;
    declare foto_url: string | null;
    declare contacto_publico: string | null;
    declare zona_horaria: CreationOptional<string>;
    declare duracion_consulta_min: number;
    declare visible: CreationOptional<boolean>;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  Profesional.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    usuario_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    zona_id: { type: DataTypes.UUID, allowNull: false },
    matricula: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    direccion_atencion: { type: DataTypes.STRING(255), allowNull: false },
    foto_url: { type: DataTypes.TEXT, allowNull: true },
    contacto_publico: { type: DataTypes.STRING(255), allowNull: true },
    zona_horaria: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'America/Argentina/Buenos_Aires' },
    duracion_consulta_min: { type: DataTypes.INTEGER, allowNull: false },
    visible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'Profesional',
    tableName: 'profesionales',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return Profesional;
}
