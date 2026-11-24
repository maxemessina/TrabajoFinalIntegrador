import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseError, ForeignKeyConstraintError, QueryTypes, UniqueConstraintError } from 'sequelize';
import { createDatabase, readDatabaseUrl } from '../../src/database/connection.ts';
import { runMigrations } from '../../src/database/migrator.ts';
import { defineModels } from '../../src/models/index.ts';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base exclusiva para pruebas');
}

const database = createDatabase(readDatabaseUrl({ DATABASE_URL: process.env.TEST_DATABASE_URL }));
const { Usuario, Rol, UsuarioRol, Paciente } = defineModels(database);

before(async () => {
  const results = await Promise.all([runMigrations(database), runMigrations(database)]);
  for (const name of ['001_create_usuarios', '002_create_roles', '003_create_pacientes']) {
    assert.ok(results.flat().filter((applied) => applied === name).length <= 1);
  }
});

after(async () => {
  await database.close();
});

test('las migraciones aplicadas no se ejecutan de nuevo', async () => {
  assert.deepEqual(await runMigrations(database), []);
});

test('los modelos coinciden con las columnas y claves de sus tablas', async () => {
  const models = [
    ['usuarios', Object.entries(Usuario.getAttributes())],
    ['roles', Object.entries(Rol.getAttributes())],
    ['usuario_roles', Object.entries(UsuarioRol.getAttributes())],
    ['pacientes', Object.entries(Paciente.getAttributes())],
  ] as const;
  for (const [table, attributes] of models) {
    const columns = await database.getQueryInterface().describeTable(table);
    assert.deepEqual(Object.keys(columns).sort(), attributes.map(([name]) => name).sort());
    for (const [name, column] of Object.entries(columns)) {
      const attribute = attributes.find(([attributeName]) => attributeName === name);
      assert.ok(attribute);
      assert.equal(column.allowNull, attribute[1].allowNull);
      assert.equal(column.primaryKey, attribute[1].primaryKey ?? false);
    }
  }
});

test('el modelo guarda un usuario con valores y fechas automáticos', async () => {
  const transaction = await database.transaction();
  try {
    const user = await Usuario.create({
      nombre: 'Ana',
      apellido: 'Ejemplo',
      email: 'ana@example.invalid',
      password_hash: 'hash-ficticio',
    }, { transaction });
    assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(user.estado, 'activo');
    assert.equal(user.telefono, null);
    assert.ok(user.creado_en instanceof Date);
    assert.ok(user.actualizado_en instanceof Date);
    const stored = await Usuario.findByPk(user.id, { transaction });
    assert.equal(stored?.email, 'ana@example.invalid');
  } finally {
    await transaction.rollback();
  }
});

test('el email es único sin distinguir mayúsculas', async () => {
  const transaction = await database.transaction();
  try {
    const data = { nombre: 'Ana', apellido: 'Ejemplo', password_hash: 'hash-ficticio' };
    await Usuario.create({ ...data, email: 'Ana@example.invalid' }, { transaction });
    await assert.rejects(
      Usuario.create({ ...data, email: 'ana@example.invalid' }, { transaction }),
      UniqueConstraintError,
    );
  } finally {
    await transaction.rollback();
  }
});

test('la base rechaza estados distintos de activo e inactivo', async () => {
  const transaction = await database.transaction();
  try {
    await assert.rejects(
      database.query(
        'INSERT INTO usuarios (nombre, apellido, email, password_hash, estado) VALUES ($1, $2, $3, $4, $5)',
        { bind: ['Ana', 'Ejemplo', 'ana@example.invalid', 'hash-ficticio', 'desconocido'], transaction },
      ),
      (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === '23514',
    );
  } finally {
    await transaction.rollback();
  }
});

test('el catálogo contiene los tres roles previstos sin duplicados al migrar de nuevo', async () => {
  await runMigrations(database);
  const roles = await Rol.findAll({ order: [['id', 'ASC']] });
  assert.deepEqual(roles.map((role) => role.codigo), ['paciente', 'profesional', 'administrador']);
});

test('un usuario puede tener varios roles y consultarlos mediante la asociación', async () => {
  const transaction = await database.transaction();
  try {
    const user = await Usuario.create({
      nombre: 'Ana',
      apellido: 'Ejemplo',
      email: 'roles@example.invalid',
      password_hash: 'hash-ficticio',
    }, { transaction });
    await UsuarioRol.bulkCreate([
      { usuario_id: user.id, rol_id: 1 },
      { usuario_id: user.id, rol_id: 2 },
    ], { transaction });
    const roles = await Rol.findAll({
      include: [{ model: Usuario, as: 'usuarios', where: { id: user.id }, through: { attributes: [] } }],
      order: [['id', 'ASC']],
      transaction,
    });
    assert.deepEqual(roles.map((role) => role.codigo), ['paciente', 'profesional']);
    const users = await Usuario.findAll({
      where: { id: user.id },
      include: [{ model: Rol, as: 'roles', where: { codigo: 'profesional' }, through: { attributes: [] } }],
      transaction,
    });
    assert.equal(users.length, 1);
  } finally {
    await transaction.rollback();
  }
});

test('la clave compuesta impide asignar dos veces el mismo rol', async () => {
  const transaction = await database.transaction();
  try {
    const user = await Usuario.create({
      nombre: 'Ana',
      apellido: 'Ejemplo',
      email: 'roles@example.invalid',
      password_hash: 'hash-ficticio',
    }, { transaction });
    await UsuarioRol.create({ usuario_id: user.id, rol_id: 1 }, { transaction });
    await assert.rejects(UsuarioRol.create({ usuario_id: user.id, rol_id: 1 }, { transaction }), UniqueConstraintError);
  } finally {
    await transaction.rollback();
  }
});

test('las claves foráneas rechazan usuarios y roles inexistentes', async () => {
  const missingUserTransaction = await database.transaction();
  try {
    await assert.rejects(
      UsuarioRol.create({ usuario_id: '11111111-1111-4111-8111-111111111111', rol_id: 1 }, { transaction: missingUserTransaction }),
      ForeignKeyConstraintError,
    );
  } finally {
    await missingUserTransaction.rollback();
  }

  const missingRoleTransaction = await database.transaction();
  try {
    const user = await Usuario.create({
      nombre: 'Ana',
      apellido: 'Ejemplo',
      email: 'roles@example.invalid',
      password_hash: 'hash-ficticio',
    }, { transaction: missingRoleTransaction });
    await assert.rejects(
      UsuarioRol.create({ usuario_id: user.id, rol_id: 999 }, { transaction: missingRoleTransaction }),
      ForeignKeyConstraintError,
    );
  } finally {
    await missingRoleTransaction.rollback();
  }
});

test('la base rechaza códigos de rol no previstos', async () => {
  const transaction = await database.transaction();
  try {
    await assert.rejects(
      database.query('INSERT INTO roles (id, codigo) VALUES ($1, $2)', {
        bind: [99, 'otro'],
        transaction,
      }),
      (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === '23514',
    );
  } finally {
    await transaction.rollback();
  }
});

test('el código de rol es único', async () => {
  const transaction = await database.transaction();
  try {
    await assert.rejects(Rol.create({ id: 99, codigo: 'paciente' }, { transaction }), UniqueConstraintError);
  } finally {
    await transaction.rollback();
  }
});

for (const target of ['usuario', 'rol'] as const) {
  test(`no puede borrarse físicamente un ${target} con una asignación`, async () => {
    const transaction = await database.transaction();
    try {
      const user = await Usuario.create({
        nombre: 'Ana',
        apellido: 'Ejemplo',
        email: 'roles@example.invalid',
        password_hash: 'hash-ficticio',
      }, { transaction });
      await UsuarioRol.create({ usuario_id: user.id, rol_id: 1 }, { transaction });
      const deletion = target === 'usuario'
        ? Usuario.destroy({ where: { id: user.id }, transaction })
        : Rol.destroy({ where: { id: 1 }, transaction });
      await assert.rejects(
        deletion,
        (error: unknown) => error instanceof DatabaseError &&
          typeof error.parent === 'object' && 'code' in error.parent &&
          (error.parent.code === '23001' || error.parent.code === '23503'),
      );
    } finally {
      await transaction.rollback();
    }
  });
}

test('un perfil admite fecha de hoy o nula y se consulta desde ambas asociaciones', async () => {
  const transaction = await database.transaction();
  try {
    const data = { nombre: 'Ana', apellido: 'Ejemplo', password_hash: 'hash-ficticio' };
    const user = await Usuario.create({ ...data, email: 'paciente@example.invalid' }, { transaction });
    const other = await Usuario.create({ ...data, email: 'paciente2@example.invalid' }, { transaction });
    const [date] = await database.query<{ hoy: string }>('SELECT CURRENT_DATE::text AS hoy', {
      type: QueryTypes.SELECT,
      transaction,
    });
    assert.ok(date);
    const patient = await Paciente.create({ usuario_id: user.id, fecha_nacimiento: date.hoy }, { transaction });
    const withoutDate = await Paciente.create({ usuario_id: other.id }, { transaction });
    assert.equal(withoutDate.fecha_nacimiento, null);
    assert.equal(patient.fecha_nacimiento, date.hoy);
    assert.ok(patient.creado_en instanceof Date);
    assert.ok(patient.actualizado_en instanceof Date);
    const linkedPatient = await Paciente.findOne({
      where: { id: patient.id },
      include: [{ model: Usuario, as: 'usuario', where: { id: user.id } }],
      transaction,
    });
    const linkedUser = await Usuario.findOne({
      where: { id: user.id },
      include: [{ model: Paciente, as: 'paciente', where: { id: patient.id } }],
      transaction,
    });
    assert.ok(linkedPatient);
    assert.ok(linkedUser);
  } finally {
    await transaction.rollback();
  }
});

test('un usuario no puede tener dos perfiles de paciente', async () => {
  const transaction = await database.transaction();
  try {
    const user = await Usuario.create({
      nombre: 'Ana', apellido: 'Ejemplo', email: 'paciente@example.invalid', password_hash: 'hash-ficticio',
    }, { transaction });
    await Paciente.create({ usuario_id: user.id }, { transaction });
    await assert.rejects(Paciente.create({ usuario_id: user.id }, { transaction }), UniqueConstraintError);
  } finally {
    await transaction.rollback();
  }
});

test('un perfil de paciente requiere un usuario existente', async () => {
  const transaction = await database.transaction();
  try {
    await assert.rejects(
      Paciente.create({ usuario_id: '11111111-1111-4111-8111-111111111111' }, { transaction }),
      ForeignKeyConstraintError,
    );
  } finally {
    await transaction.rollback();
  }
});

test('la base rechaza fechas de nacimiento futuras', async () => {
  const transaction = await database.transaction();
  try {
    const user = await Usuario.create({
      nombre: 'Ana', apellido: 'Ejemplo', email: 'paciente@example.invalid', password_hash: 'hash-ficticio',
    }, { transaction });
    await assert.rejects(
      database.query('INSERT INTO pacientes (usuario_id, fecha_nacimiento) VALUES ($1, CURRENT_DATE + 1)', {
        bind: [user.id], transaction,
      }),
      (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent && error.parent.code === '23514',
    );
  } finally {
    await transaction.rollback();
  }
});

test('no puede borrarse físicamente un usuario con perfil de paciente', async () => {
  const transaction = await database.transaction();
  try {
    const user = await Usuario.create({
      nombre: 'Ana', apellido: 'Ejemplo', email: 'paciente@example.invalid', password_hash: 'hash-ficticio',
    }, { transaction });
    await Paciente.create({ usuario_id: user.id }, { transaction });
    await assert.rejects(
      Usuario.destroy({ where: { id: user.id }, transaction }),
      (error: unknown) => error instanceof DatabaseError &&
        typeof error.parent === 'object' && 'code' in error.parent &&
        (error.parent.code === '23001' || error.parent.code === '23503'),
    );
  } finally {
    await transaction.rollback();
  }
});
