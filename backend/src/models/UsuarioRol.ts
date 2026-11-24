import { DataTypes, Model, literal } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

export function defineUsuarioRol(database: Sequelize) {
  class UsuarioRol extends Model<InferAttributes<UsuarioRol>, InferCreationAttributes<UsuarioRol>> {
    declare usuario_id: string;
    declare rol_id: number;
    declare creado_en: CreationOptional<Date>;
  }

  UsuarioRol.init({
    usuario_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    rol_id: { type: DataTypes.SMALLINT, allowNull: false, primaryKey: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, {
    sequelize: database,
    modelName: 'UsuarioRol',
    tableName: 'usuario_roles',
    createdAt: 'creado_en',
    updatedAt: false,
  });

  return UsuarioRol;
}
