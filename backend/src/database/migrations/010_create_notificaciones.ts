import { DataTypes, literal, Op } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createNotificaciones(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.createTable('notificaciones', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    turno_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'turnos', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    turno_version: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.STRING(40), allowNull: false },
    estado: { type: DataTypes.STRING(20), allowNull: false },
    programada_para: { type: DataTypes.DATE, allowNull: false },
    enviada_en: { type: DataTypes.DATE, allowNull: true },
    intentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ultimo_error: { type: DataTypes.STRING(500), allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.addConstraint('notificaciones', {
    fields: ['turno_id', 'turno_version', 'tipo'], type: 'unique',
    name: 'notificaciones_turno_version_tipo_unico', transaction,
  });
  await queryInterface.addConstraint('notificaciones', {
    fields: ['turno_version'], type: 'check', name: 'notificaciones_turno_version_check',
    where: { turno_version: { [Op.gt]: 0 } }, transaction,
  });
  await queryInterface.addConstraint('notificaciones', {
    fields: ['tipo'], type: 'check', name: 'notificaciones_tipo_check',
    where: { tipo: { [Op.in]: ['confirmacion_paciente', 'recordatorio_paciente', 'resumen_profesional'] } },
    transaction,
  });
  await queryInterface.addConstraint('notificaciones', {
    fields: ['estado'], type: 'check', name: 'notificaciones_estado_check',
    where: { estado: { [Op.in]: ['pendiente', 'enviando', 'enviada', 'fallida', 'cancelada'] } }, transaction,
  });
  await queryInterface.addConstraint('notificaciones', {
    fields: ['intentos'], type: 'check', name: 'notificaciones_intentos_check',
    where: { intentos: { [Op.gte]: 0 } }, transaction,
  });
  await queryInterface.addConstraint('notificaciones', {
    fields: ['estado', 'enviada_en'], type: 'check', name: 'notificaciones_enviada_en_check',
    where: { [Op.or]: [{ estado: { [Op.ne]: 'enviada' } }, { enviada_en: { [Op.ne]: null } }] },
    transaction,
  });
  await queryInterface.addIndex('notificaciones', ['estado', 'programada_para'], {
    name: 'notificaciones_estado_programada_idx', transaction,
  });
}
