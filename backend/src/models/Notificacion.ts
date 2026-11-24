import { DataTypes, literal, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineNotificacion(database: Sequelize) {
  class Notificacion extends Model<InferAttributes<Notificacion>, InferCreationAttributes<Notificacion>> {
    declare id: CreationOptional<string>;
    declare turno_id: string;
    declare turno_version: number;
    declare tipo: 'confirmacion_paciente' | 'recordatorio_paciente' | 'resumen_profesional';
    declare estado: 'pendiente' | 'enviando' | 'enviada' | 'fallida' | 'cancelada';
    declare programada_para: Date;
    declare enviada_en: Date | null;
    declare intentos: CreationOptional<number>;
    declare ultimo_error: string | null;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  Notificacion.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    turno_id: { type: DataTypes.UUID, allowNull: false },
    turno_version: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.STRING(40), allowNull: false },
    estado: { type: DataTypes.STRING(20), allowNull: false },
    programada_para: { type: DataTypes.DATE, allowNull: false },
    enviada_en: { type: DataTypes.DATE, allowNull: true },
    intentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ultimo_error: { type: DataTypes.STRING(500), allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'Notificacion',
    tableName: 'notificaciones',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return Notificacion;
}
