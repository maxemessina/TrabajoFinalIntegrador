import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute, Sequelize } from 'sequelize';

type UsuarioResumen = { nombre: string; apellido: string; estado: 'activo' | 'inactivo' };

export function definePaciente(database: Sequelize) {
  class Paciente extends Model<InferAttributes<Paciente>, InferCreationAttributes<Paciente>> {
    declare id: CreationOptional<string>;
    declare usuario_id: string;
    declare usuario?: NonAttribute<UsuarioResumen>;
    declare fecha_nacimiento: string | null;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  Paciente.init({
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: literal('gen_random_uuid()'),
    },
    usuario_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    fecha_nacimiento: { type: DataTypes.DATEONLY, allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'Paciente',
    tableName: 'pacientes',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return Paciente;
}
