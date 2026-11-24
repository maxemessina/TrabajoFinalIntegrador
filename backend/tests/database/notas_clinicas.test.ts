import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseError, ForeignKeyConstraintError } from 'sequelize';
import type { Transaction } from 'sequelize';
import { createDatabase, readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { defineModels } from '../../src/models/index.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const database = createDatabase(readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL }));
const { Usuario, Zona, Paciente, Profesional, Turno, FichaClinica, NotaClinica } = defineModels(database);

before(async () => {
  await runMigrations(database);
});

after(async () => {
  await database.close();
});

async function createFixture(transaction: Transaction) {
  const suffix = randomUUID();
  const user = await Usuario.create({
    nombre: 'Ana', apellido: 'Ejemplo', email: `nota-${suffix}@example.invalid`, password_hash: 'hash-ficticio',
  }, { transaction });
  const zone = await Zona.create({ nombre: `Zona ${suffix}`, provincia: 'Provincia test' }, { transaction });
  const patient = await Paciente.create({ usuario_id: user.id }, { transaction });
  const professional = await Profesional.create({
    usuario_id: user.id, zona_id: zone.id, matricula: `NOTA-${suffix}`,
    direccion_atencion: 'Direccion ficticia', duracion_consulta_min: 30,
  }, { transaction });
  const titulares = { paciente_id: patient.id, profesional_id: professional.id };
  const ficha = await FichaClinica.create(titulares, { transaction });
  const turno = await Turno.create({
    ...titulares, inicio: new Date('2026-01-01T10:00:00Z'), fin: new Date('2026-01-01T10:30:00Z'),
    estado: 'atendido',
  }, { transaction });
  return { patient, professional, titulares, ficha, turno };
}

function isReferenceError(error: unknown): boolean {
  return error instanceof DatabaseError &&
    typeof error.parent === 'object' && 'code' in error.parent &&
    (error.parent.code === '23001' || error.parent.code === '23503');
}

test('una ficha admite notas con o sin turno y se consultan sus asociaciones', async () => {
  const transaction = await database.transaction();
  try {
    const { titulares, ficha, turno } = await createFixture(transaction);
    const nota = await NotaClinica.create({
      ficha_id: ficha.id, turno_id: turno.id, ...titulares, contenido: 'Nota ficticia',
    }, { transaction });
    const sinTurno = await NotaClinica.create({
      ficha_id: ficha.id, ...titulares, contenido: 'Otra nota ficticia',
    }, { transaction });
    await NotaClinica.create({
      ficha_id: ficha.id, turno_id: turno.id, ...titulares, contenido: 'Segunda nota ficticia',
    }, { transaction });
    assert.equal(sinTurno.turno_id, null);
    assert.ok(nota.creado_en instanceof Date);
    assert.ok(nota.actualizado_en instanceof Date);
    assert.ok(await NotaClinica.findOne({
      where: { id: nota.id },
      include: [
        { model: FichaClinica, as: 'ficha', where: { id: ficha.id } },
        { model: Turno, as: 'turno', where: { id: turno.id } },
      ],
      transaction,
    }));
    assert.ok(await FichaClinica.findOne({
      where: { id: ficha.id },
      include: [{ model: NotaClinica, as: 'notas', where: { id: sinTurno.id } }], transaction,
    }));
    assert.ok(await Turno.findOne({
      where: { id: turno.id },
      include: [{ model: NotaClinica, as: 'notas', where: { id: nota.id } }], transaction,
    }));
    assert.equal(await NotaClinica.count({ where: { turno_id: turno.id }, transaction }), 2);
  } finally {
    await transaction.rollback();
  }
});

for (const mismatch of ['paciente', 'profesional'] as const) {
  test(`el turno de la nota no puede pertenecer a otro ${mismatch}`, async () => {
    const transaction = await database.transaction();
    try {
      const first = await createFixture(transaction);
      const second = await createFixture(transaction);
      const turno = await Turno.create({
        paciente_id: mismatch === 'paciente' ? second.patient.id : first.patient.id,
        profesional_id: mismatch === 'profesional' ? second.professional.id : first.professional.id,
        inicio: new Date('2026-01-01T11:00:00Z'), fin: new Date('2026-01-01T11:30:00Z'), estado: 'atendido',
      }, { transaction });
      await assert.rejects(NotaClinica.create({
        ficha_id: first.ficha.id, turno_id: turno.id, ...first.titulares, contenido: 'Nota ficticia',
      }, { transaction }), ForeignKeyConstraintError);
    } finally {
      await transaction.rollback();
    }
  });
}

for (const mismatch of ['paciente', 'profesional'] as const) {
  test(`los titulares de la nota deben coincidir con la ficha: ${mismatch}`, async () => {
    const transaction = await database.transaction();
    try {
      const first = await createFixture(transaction);
      const second = await createFixture(transaction);
      await assert.rejects(NotaClinica.create({
        ficha_id: first.ficha.id,
        paciente_id: mismatch === 'paciente' ? second.patient.id : first.patient.id,
        profesional_id: mismatch === 'profesional' ? second.professional.id : first.professional.id,
        contenido: 'Nota ficticia',
      }, { transaction }), ForeignKeyConstraintError);
    } finally {
      await transaction.rollback();
    }
  });
}

for (const missing of ['ficha', 'turno'] as const) {
  test(`la nota rechaza un identificador de ${missing} inexistente`, async () => {
    const transaction = await database.transaction();
    try {
      const { titulares, ficha, turno } = await createFixture(transaction);
      await assert.rejects(NotaClinica.create({
        ficha_id: missing === 'ficha' ? randomUUID() : ficha.id,
        turno_id: missing === 'turno' ? randomUUID() : turno.id,
        ...titulares, contenido: 'Nota ficticia',
      }, { transaction }), ForeignKeyConstraintError);
    } finally {
      await transaction.rollback();
    }
  });
}

test('una nota existente no puede reasignarse a un turno de otra pareja', async () => {
  const transaction = await database.transaction();
  try {
    const first = await createFixture(transaction);
    const second = await createFixture(transaction);
    const nota = await NotaClinica.create({
      ficha_id: first.ficha.id, ...first.titulares, contenido: 'Nota ficticia',
    }, { transaction });
    await assert.rejects(nota.update({ turno_id: second.turno.id }, { transaction }), ForeignKeyConstraintError);
  } finally {
    await transaction.rollback();
  }
});

for (const target of ['ficha', 'turno'] as const) {
  for (const action of ['borrar', 'cambiar titulares'] as const) {
    test(`no se puede ${action} de ${target} con una nota asociada`, async () => {
      const transaction = await database.transaction();
      try {
        const first = await createFixture(transaction);
        const second = await createFixture(transaction);
        await NotaClinica.create({
          ficha_id: first.ficha.id, turno_id: first.turno.id, ...first.titulares, contenido: 'Nota ficticia',
        }, { transaction });
        const operation = action === 'borrar'
          ? (target === 'ficha' ? first.ficha.destroy({ transaction }) : first.turno.destroy({ transaction }))
          : (target === 'ficha'
            ? first.ficha.update({ paciente_id: second.patient.id }, { transaction })
            : first.turno.update({ paciente_id: second.patient.id }, { transaction }));
        await assert.rejects(operation, isReferenceError);
      } finally {
        await transaction.rollback();
      }
    });
  }
}

test('la base exige titulares y contenido incluso cuando no hay turno', async () => {
  for (const column of ['paciente_id', 'profesional_id', 'contenido'] as const) {
    const transaction = await database.transaction();
    try {
      const { titulares, ficha } = await createFixture(transaction);
      const values = {
        ficha_id: ficha.id, ...titulares, contenido: 'Nota ficticia', [column]: null,
      };
      await assert.rejects(database.query(
        'INSERT INTO notas_clinicas (ficha_id, paciente_id, profesional_id, contenido) VALUES ($1, $2, $3, $4)',
        { bind: [values.ficha_id, values.paciente_id, values.profesional_id, values.contenido], transaction },
      ), (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === '23502');
    } finally {
      await transaction.rollback();
    }
  }
});
