import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineUsuario(database: Sequelize) {
  class Usuario extends Model<InferAttributes<Usuario>, InferCreationAttributes<Usuario>> {
    declare id: CreationOptional<string>;
    declare nombre: string;
    declare apellido: string;
    declare email: string;
    declare password_hash: string;
    declare telefono: string | null;
    declare estado: CreationOptional<'activo' | 'inactivo'>;
    declare creado_en: CreationOptional<Date>;
    declare actualizado_en: CreationOptional<Date>;
  }

  Usuario.init({
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: literal('gen_random_uuid()'),
    },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    apellido: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(254), allowNull: false },
    password_hash: { type: DataTypes.TEXT, allowNull: false },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'activo' },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'Usuario',
    tableName: 'usuarios',
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
  });

  return Usuario;
}
