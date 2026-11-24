import { loadEnv } from '../config.ts';
import { createDatabase, readDatabaseUrl } from './connection.ts';
import { seedDemo } from './seeders/demo.ts';

loadEnv();
if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  throw new Error('El seed demo requiere NODE_ENV=development o NODE_ENV=test; no usar en producción');
}
const database = createDatabase(readDatabaseUrl());

try {
  const inserted = await database.transaction((transaction) => seedDemo(database, transaction));
  console.log(inserted ? 'Datos demo cargados' : 'Los datos demo ya fueron cargados; no se modificaron');
} catch (error: unknown) {
  const name = error instanceof Error && /^Sequelize[A-Za-z]+Error$/.test(error.name)
    ? error.name
    : 'Error de carga';
  console.error(`No se pudieron cargar los datos demo (${name}). Revisá las migraciones y posibles conflictos.`);
  process.exitCode = 1;
} finally {
  await database.close();
}
