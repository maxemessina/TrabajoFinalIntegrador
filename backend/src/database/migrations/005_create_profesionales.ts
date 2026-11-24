import { DataTypes, literal, Op } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createProfesionales(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.createTable('profesionales', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    usuario_id: {
      type: DataTypes.UUID, allowNull: false, unique: true,
      references: { model: 'usuarios', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    zona_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'zonas', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
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
  }, { transaction });
  await queryInterface.addConstraint('profesionales', {
    fields: ['duracion_consulta_min'],
    type: 'check',
    name: 'profesionales_duracion_check',
    where: { duracion_consulta_min: { [Op.gt]: 0 } },
    transaction,
  });
  await queryInterface.addIndex('profesionales', ['zona_id'], { name: 'profesionales_zona_id_idx', transaction });

  await queryInterface.createTable('profesional_especialidades', {
    profesional_id: {
      type: DataTypes.UUID, allowNull: false, primaryKey: true,
      references: { model: 'profesionales', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    especialidad_id: {
      type: DataTypes.UUID, allowNull: false, primaryKey: true,
      references: { model: 'especialidades', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.addIndex('profesional_especialidades', ['especialidad_id'], {
    name: 'profesional_especialidades_especialidad_id_idx', transaction,
  });

  await queryInterface.createTable('trabajos_profesional', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    profesional_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'profesionales', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    titulo: { type: DataTypes.STRING(150), allowNull: false },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    imagen_url: { type: DataTypes.TEXT, allowNull: true },
    visible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.addIndex('trabajos_profesional', ['profesional_id'], {
    name: 'trabajos_profesional_profesional_id_idx', transaction,
  });
}
