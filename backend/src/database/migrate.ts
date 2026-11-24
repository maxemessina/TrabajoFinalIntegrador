import { loadEnv } from '../config.ts';
import { createDatabase, readDatabaseUrl } from './connection.ts';
import { MigrationStateError, runMigrations } from './migrator.ts';

loadEnv();
const database = createDatabase(readDatabaseUrl());

try {
  const executed = await runMigrations(database);
  if (executed.length === 0) {
    console.log('No hay migraciones pendientes');
  } else {
    console.log(`Migraciones aplicadas: ${executed.join(', ')}`);
  }
} catch (error: unknown) {
  if (error instanceof MigrationStateError) {
    console.error(error.message);
  } else {
    const name = error instanceof Error && /^Sequelize[A-Za-z]+Error$/.test(error.name)
      ? error.name
      : 'Error de migración';
    console.error(`No se pudieron aplicar las migraciones (${name}). Revisá la conexión y el esquema.`);
  }
  process.exitCode = 1;
} finally {
  await database.close();
}
