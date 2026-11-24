import { QueryTypes } from 'sequelize';
import type { QueryInterface, Sequelize, Transaction } from 'sequelize';
import { createUsuarios } from './migrations/001_create_usuarios.ts';
import { createRoles } from './migrations/002_create_roles.ts';
import { createPacientes } from './migrations/003_create_pacientes.ts';
import { createCatalogos } from './migrations/004_create_catalogos.ts';
import { createProfesionales } from './migrations/005_create_profesionales.ts';
import { createAgenda } from './migrations/006_create_agenda.ts';
import { createTokensRecuperacion } from './migrations/007_create_tokens_recuperacion.ts';
import { createEventosVisita } from './migrations/008_create_eventos_visita.ts';
import { createTurnos } from './migrations/009_create_turnos.ts';
import { createNotificaciones } from './migrations/010_create_notificaciones.ts';

type Migration = {
  name: string;
  up: (queryInterface: QueryInterface, transaction: Transaction) => Promise<void>;
};

const migrations: readonly Migration[] = [
  { name: '001_create_usuarios', up: createUsuarios },
  { name: '002_create_roles', up: createRoles },
  { name: '003_create_pacientes', up: createPacientes },
  { name: '004_create_catalogos', up: createCatalogos },
  { name: '005_create_profesionales', up: createProfesionales },
  { name: '006_create_agenda', up: createAgenda },
  { name: '007_create_tokens_recuperacion', up: createTokensRecuperacion },
  { name: '008_create_eventos_visita', up: createEventosVisita },
  { name: '009_create_turnos', up: createTurnos },
  { name: '010_create_notificaciones', up: createNotificaciones },
];

export class MigrationStateError extends Error {
  constructor() {
    super('El historial de migraciones no coincide con esta versión del proyecto');
    this.name = 'MigrationStateError';
  }
}

export async function runMigrations(database: Sequelize): Promise<string[]> {
  return database.transaction(async (transaction) => {
    if (migrations.some((migration, index) => {
      const previous = migrations[index - 1];
      return previous !== undefined && previous.name >= migration.name;
    })) {
      throw new MigrationStateError();
    }

    await database.query('SELECT pg_advisory_xact_lock(1346851657, 4)', { transaction });
    await database.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (nombre varchar(255) PRIMARY KEY, ejecutada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)',
      { transaction },
    );
    const applied = await database.query<{ nombre: string }>(
      'SELECT nombre FROM schema_migrations ORDER BY nombre',
      { type: QueryTypes.SELECT, transaction },
    );

    if (applied.length > migrations.length ||
        applied.some((record, index) => record.nombre !== migrations[index]?.name)) {
      throw new MigrationStateError();
    }

    const executed: string[] = [];
    for (const migration of migrations.slice(applied.length)) {
      await migration.up(database.getQueryInterface(), transaction);
      await database.query(
        'INSERT INTO schema_migrations (nombre) VALUES (:nombre)',
        { replacements: { nombre: migration.name }, transaction },
      );
      executed.push(migration.name);
    }
    return executed;
  });
}
