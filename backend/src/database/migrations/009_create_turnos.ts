import { col, DataTypes, literal, Op } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createTurnos(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gist', { transaction });
  await queryInterface.createTable('turnos', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    paciente_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'pacientes', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    profesional_id: {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'profesionales', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
    },
    inicio: { type: DataTypes.DATE, allowNull: false },
    fin: { type: DataTypes.DATE, allowNull: false },
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'reservado' },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    cancelado_en: { type: DataTypes.DATE, allowNull: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.addConstraint('turnos', {
    fields: ['inicio', 'fin'], type: 'check', name: 'turnos_intervalo_check',
    where: { inicio: { [Op.lt]: col('fin') } }, transaction,
  });
  await queryInterface.addConstraint('turnos', {
    fields: ['estado'], type: 'check', name: 'turnos_estado_check',
    where: { estado: { [Op.in]: ['reservado', 'cancelado', 'atendido', 'ausente'] } }, transaction,
  });
  await queryInterface.addConstraint('turnos', {
    fields: ['version'], type: 'check', name: 'turnos_version_check',
    where: { version: { [Op.gt]: 0 } }, transaction,
  });
  await queryInterface.addConstraint('turnos', {
    fields: ['estado', 'cancelado_en'], type: 'check', name: 'turnos_cancelado_en_check',
    where: {
      [Op.or]: [
        { estado: 'cancelado', cancelado_en: { [Op.ne]: null } },
        { estado: { [Op.ne]: 'cancelado' }, cancelado_en: null },
      ],
    },
    transaction,
  });
  await queryInterface.sequelize.query(
    `ALTER TABLE turnos ADD CONSTRAINT turnos_reservados_sin_solapamiento
     EXCLUDE USING gist (profesional_id WITH =, tstzrange(inicio, fin, '[)') WITH &&)
     WHERE (estado = 'reservado')`,
    { transaction },
  );
  await queryInterface.addIndex('turnos', ['paciente_id', 'inicio'], {
    name: 'turnos_paciente_inicio_idx', transaction,
  });
  await queryInterface.addIndex('turnos', ['profesional_id', 'inicio'], {
    name: 'turnos_profesional_inicio_idx', transaction,
  });
}
