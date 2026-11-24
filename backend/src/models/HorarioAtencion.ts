import { DataTypes, literal, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineHorarioAtencion(database: Sequelize) {
  class HorarioAtencion extends Model<InferAttributes<HorarioAtencion>, InferCreationAttributes<HorarioAtencion>> {
    declare id: CreationOptional<string>;
    declare profesional_id: string;
    declare dia_semana: number;
    declare hora_inicio: string;
    declare hora_fin: string;
    declare vigente_desde: string;
    declare vigente_hasta: string | null;
    declare activo: CreationOptional<boolean>;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  HorarioAtencion.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    profesional_id: { type: DataTypes.UUID, allowNull: false },
    dia_semana: { type: DataTypes.SMALLINT, allowNull: false },
    hora_inicio: { type: DataTypes.TIME, allowNull: false },
    hora_fin: { type: DataTypes.TIME, allowNull: false },
    vigente_desde: { type: DataTypes.DATEONLY, allowNull: false },
    vigente_hasta: { type: DataTypes.DATEONLY, allowNull: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'HorarioAtencion',
    tableName: 'horarios_atencion',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return HorarioAtencion;
}
