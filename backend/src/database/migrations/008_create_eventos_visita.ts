import { DataTypes, literal, Op } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createEventosVisita(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.createTable('eventos_visita', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    usuario_id: {
      type: DataTypes.UUID, allowNull: true,
      references: { model: 'usuarios', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    profesional_id: {
      type: DataTypes.UUID, allowNull: true,
      references: { model: 'profesionales', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    tipo: { type: DataTypes.STRING(30), allowNull: false },
    ocurrido_en: { type: DataTypes.DATE, allowNull: false },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.addConstraint('eventos_visita', {
    fields: ['tipo'], type: 'check', name: 'eventos_visita_tipo_check',
    where: { tipo: { [Op.in]: ['visita_inicio', 'visita_perfil'] } }, transaction,
  });
  await queryInterface.addConstraint('eventos_visita', {
    fields: ['tipo', 'profesional_id'], type: 'check', name: 'eventos_visita_perfil_check',
    where: {
      [Op.or]: [
        { tipo: 'visita_inicio', profesional_id: null },
        { tipo: 'visita_perfil', profesional_id: { [Op.ne]: null } },
      ],
    },
    transaction,
  });
  await queryInterface.addIndex('eventos_visita', ['tipo', 'ocurrido_en'], {
    name: 'eventos_visita_tipo_ocurrido_en_idx', transaction,
  });
  await queryInterface.addIndex('eventos_visita', ['profesional_id', 'ocurrido_en'], {
    name: 'eventos_visita_profesional_ocurrido_en_idx', transaction,
  });
}
