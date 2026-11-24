import { loadEnv } from '../config.ts';
import { createDatabase, readDatabaseUrl } from './connection.ts';

loadEnv();
const database = createDatabase(readDatabaseUrl());

try {
  await database.authenticate();
  console.log('Conexión a PostgreSQL verificada');
} catch (error: unknown) {
  const name = error instanceof Error && /^Sequelize[A-Za-z]+Error$/.test(error.name)
    ? error.name
    : 'Error de conexión';
  console.error(`No se pudo conectar a PostgreSQL (${name}). Revisá DATABASE_URL y el servidor.`);
  process.exitCode = 1;
} finally {
  await database.close();
}
