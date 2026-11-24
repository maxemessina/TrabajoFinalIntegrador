import { DataTypes, literal } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export async function createNotasClinicas(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  await queryInterface.addConstraint('fichas_clinicas', {
    fields: ['id', 'paciente_id', 'profesional_id'], type: 'unique',
    name: 'fichas_clinicas_id_paciente_profesional_unico', transaction,
  });
  await queryInterface.addConstraint('turnos', {
    fields: ['id', 'paciente_id', 'profesional_id'], type: 'unique',
    name: 'turnos_id_paciente_profesional_unico', transaction,
  });
  await queryInterface.createTable('notas_clinicas', {
    id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
    ficha_id: { type: DataTypes.UUID, allowNull: false },
    turno_id: { type: DataTypes.UUID, allowNull: true },
    paciente_id: { type: DataTypes.UUID, allowNull: false },
    profesional_id: { type: DataTypes.UUID, allowNull: false },
    contenido: { type: DataTypes.TEXT, allowNull: false },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });
  await queryInterface.sequelize.query(
    `ALTER TABLE notas_clinicas
      ADD CONSTRAINT notas_clinicas_ficha_titulares_fk
        FOREIGN KEY (ficha_id, paciente_id, profesional_id)
        REFERENCES fichas_clinicas (id, paciente_id, profesional_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
      ADD CONSTRAINT notas_clinicas_turno_titulares_fk
        FOREIGN KEY (turno_id, paciente_id, profesional_id)
        REFERENCES turnos (id, paciente_id, profesional_id) ON DELETE RESTRICT ON UPDATE RESTRICT`,
    { transaction },
  );
  await queryInterface.addIndex('notas_clinicas', ['ficha_id', 'creado_en'], {
    name: 'notas_clinicas_ficha_creado_idx', transaction,
  });
}
