import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { UniqueConstraintError } from 'sequelize';
import { createDatabase, readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { defineModels } from '../../src/models/index.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const database = createDatabase(readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL }));
const { Zona, Especialidad } = defineModels(database);

before(async () => {
  await runMigrations(database);
});

after(async () => {
  await database.close();
});

test('los catálogos se crean activos y pueden desactivarse', async () => {
  const transaction = await database.transaction();
  try {
    const zone = await Zona.create({ nombre: 'Zona ejemplo', provincia: 'Provincia ejemplo' }, { transaction });
    const specialty = await Especialidad.create({ nombre: 'Especialidad ejemplo' }, { transaction });
    for (const entry of [zone, specialty]) {
      assert.match(entry.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal(entry.activa, true);
      assert.ok(entry.creado_en instanceof Date);
      assert.ok(entry.actualizado_en instanceof Date);
    }
    await zone.update({ activa: false }, { transaction });
    await specialty.update({ activa: false }, { transaction });
    await zone.reload({ transaction });
    await specialty.reload({ transaction });
    assert.equal(zone.activa, false);
    assert.equal(specialty.activa, false);
  } finally {
    await transaction.rollback();
  }
});

test('una zona puede repetir nombre en otra provincia o tener otro nombre en la misma', async () => {
  const transaction = await database.transaction();
  try {
    const first = await Zona.create({ nombre: 'Centro', provincia: 'Provincia uno' }, { transaction });
    const otherProvince = await Zona.create({ nombre: 'CENTRO', provincia: 'Provincia dos' }, { transaction });
    const otherName = await Zona.create({ nombre: 'Norte', provincia: 'PROVINCIA UNO' }, { transaction });
    assert.notEqual(first.id, otherProvince.id);
    assert.notEqual(first.id, otherName.id);
  } finally {
    await transaction.rollback();
  }
});

for (const duplicate of [
  { nombre: 'CENTRO', provincia: 'Provincia uno' },
  { nombre: 'Centro', provincia: 'PROVINCIA UNO' },
]) {
  test(`la zona es única sin distinguir mayúsculas: ${duplicate.nombre}, ${duplicate.provincia}`, async () => {
    const transaction = await database.transaction();
    try {
      await Zona.create({ nombre: 'Centro', provincia: 'Provincia uno', activa: false }, { transaction });
      await assert.rejects(Zona.create(duplicate, { transaction }), UniqueConstraintError);
    } finally {
      await transaction.rollback();
    }
  });
}

test('una zona con acentos también es única sin distinguir mayúsculas', async () => {
  const transaction = await database.transaction();
  try {
    await Zona.create({ nombre: 'Río Cuarto', provincia: 'Córdoba' }, { transaction });
    await assert.rejects(Zona.create({ nombre: 'RÍO CUARTO', provincia: 'CÓRDOBA' }, { transaction }), UniqueConstraintError);
  } finally {
    await transaction.rollback();
  }
});

test('la especialidad es única sin distinguir mayúsculas, incluso si está inactiva', async () => {
  const transaction = await database.transaction();
  try {
    await Especialidad.create({ nombre: 'Cardiología', activa: false }, { transaction });
    await assert.rejects(Especialidad.create({ nombre: 'CARDIOLOGÍA' }, { transaction }), UniqueConstraintError);
  } finally {
    await transaction.rollback();
  }
});
