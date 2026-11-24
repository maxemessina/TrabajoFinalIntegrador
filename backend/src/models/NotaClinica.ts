import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineNotaClinica(database: Sequelize) {
  class NotaClinica extends Model<InferAttributes<NotaClinica>, InferCreationAttributes<NotaClinica>> {
    declare id: CreationOptional<string>;
    declare ficha_id: string;
    declare turno_id: string | null;
    declare paciente_id: string;
    declare profesional_id: string;
    declare contenido: string;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  NotaClinica.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    ficha_id: { type: DataTypes.UUID, allowNull: false },
    turno_id: { type: DataTypes.UUID, allowNull: true },
    paciente_id: { type: DataTypes.UUID, allowNull: false },
    profesional_id: { type: DataTypes.UUID, allowNull: false },
    contenido: { type: DataTypes.TEXT, allowNull: false },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'NotaClinica',
    tableName: 'notas_clinicas',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return NotaClinica;
}
