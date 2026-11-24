import { DataTypes, literal, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineEventoVisita(database: Sequelize) {
  class EventoVisita extends Model<InferAttributes<EventoVisita>, InferCreationAttributes<EventoVisita>> {
    declare id: CreationOptional<string>;
    declare usuario_id: string | null;
    declare profesional_id: string | null;
    declare tipo: 'visita_inicio' | 'visita_perfil';
    declare ocurrido_en: Date;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  EventoVisita.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    usuario_id: { type: DataTypes.UUID, allowNull: true },
    profesional_id: { type: DataTypes.UUID, allowNull: true },
    tipo: { type: DataTypes.STRING(30), allowNull: false },
    ocurrido_en: { type: DataTypes.DATE, allowNull: false },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'EventoVisita',
    tableName: 'eventos_visita',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return EventoVisita;
}
