import { DataTypes, literal, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineTurno(database: Sequelize) {
  class Turno extends Model<InferAttributes<Turno>, InferCreationAttributes<Turno>> {
    declare id: CreationOptional<string>;
    declare paciente_id: string;
    declare profesional_id: string;
    declare inicio: Date;
    declare fin: Date;
    declare estado: CreationOptional<'reservado' | 'cancelado' | 'atendido' | 'ausente'>;
    declare version: CreationOptional<number>;
    declare cancelado_en: Date | null;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  Turno.init({
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    paciente_id: { type: DataTypes.UUID, allowNull: false },
    profesional_id: { type: DataTypes.UUID, allowNull: false },
    inicio: { type: DataTypes.DATE, allowNull: false },
    fin: { type: DataTypes.DATE, allowNull: false },
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'reservado' },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    cancelado_en: { type: DataTypes.DATE, allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'Turno',
    tableName: 'turnos',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return Turno;
}
