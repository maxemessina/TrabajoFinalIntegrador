import { col, DataTypes, literal, Op } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createAgenda(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.createTable('horarios_atencion', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    profesional_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'profesionales', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    dia_semana: { type: DataTypes.SMALLINT, allowNull: false },
    hora_inicio: { type: DataTypes.TIME, allowNull: false },
    hora_fin: { type: DataTypes.TIME, allowNull: false },
    vigente_desde: { type: DataTypes.DATEONLY, allowNull: false },
    vigente_hasta: { type: DataTypes.DATEONLY, allowNull: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.addConstraint('horarios_atencion', {
    fields: ['dia_semana'], type: 'check', name: 'horarios_atencion_dia_check',
    where: { dia_semana: { [Op.between]: [1, 7] } }, transaction,
  });
  await queryInterface.addConstraint('horarios_atencion', {
    fields: ['hora_inicio', 'hora_fin'], type: 'check', name: 'horarios_atencion_horas_check',
    where: { hora_inicio: { [Op.lt]: col('hora_fin') } }, transaction,
  });
  await queryInterface.addConstraint('horarios_atencion', {
    fields: ['vigente_desde', 'vigente_hasta'], type: 'check', name: 'horarios_atencion_vigencia_check',
    where: { vigente_hasta: { [Op.gte]: col('vigente_desde') } }, transaction,
  });
  await queryInterface.addIndex('horarios_atencion', ['profesional_id', 'dia_semana'], {
    name: 'horarios_atencion_profesional_dia_idx', transaction,
  });

  await queryInterface.createTable('bloqueos_agenda', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    profesional_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'profesionales', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    inicio: { type: DataTypes.DATE, allowNull: false },
    fin: { type: DataTypes.DATE, allowNull: false },
    motivo: { type: DataTypes.STRING(255), allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.addConstraint('bloqueos_agenda', {
    fields: ['inicio', 'fin'], type: 'check', name: 'bloqueos_agenda_intervalo_check',
    where: { inicio: { [Op.lt]: col('fin') } }, transaction,
  });
  await queryInterface.addIndex('bloqueos_agenda', ['profesional_id', 'inicio'], {
    name: 'bloqueos_agenda_profesional_inicio_idx', transaction,
  });
}
