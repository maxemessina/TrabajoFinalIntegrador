import { DataTypes, QueryTypes, literal } from 'sequelize';
import type { QueryInterface, Transaction } from 'sequelize';

export class MissingIcuCollationError extends Error {
  constructor() {
    super('La migración de catálogos requiere PostgreSQL con la intercalación ICU und-x-icu');
    this.name = 'MissingIcuCollationError';
  }
}

export async function createCatalogos(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  const [collation] = await queryInterface.sequelize.query<{ disponible: boolean }>(
    'SELECT pg_catalog.to_regcollation(\'pg_catalog."und-x-icu"\') IS NOT NULL AS disponible',
    { type: QueryTypes.SELECT, transaction },
  );
  if (!collation?.disponible) {
    throw new MissingIcuCollationError();
  }

  await queryInterface.createTable('zonas', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: literal('gen_random_uuid()'),
    },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    provincia: { type: DataTypes.STRING(100), allowNull: false },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });

  await queryInterface.createTable('especialidades', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: literal('gen_random_uuid()'),
    },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    creado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
  }, { transaction });

  await queryInterface.sequelize.query(
    'CREATE UNIQUE INDEX zonas_provincia_nombre_unico ON zonas (lower(provincia COLLATE pg_catalog."und-x-icu"), lower(nombre COLLATE pg_catalog."und-x-icu"))',
    { transaction },
  );
  await queryInterface.sequelize.query(
    'CREATE UNIQUE INDEX especialidades_nombre_unico ON especialidades (lower(nombre COLLATE pg_catalog."und-x-icu"))',
    { transaction },
  );
}
