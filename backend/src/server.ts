import { createApp } from './app.ts';
import { loadEnv, readAuthConfig, readConfig } from './config.ts';
import { createDatabase, readDatabaseUrl } from './database/connection.ts';

loadEnv();
const config = readConfig();
const auth = process.env.DATABASE_URL
  ? { database: createDatabase(readDatabaseUrl()), jwtSecret: readAuthConfig().jwtSecret }
  : undefined;
if (auth) {
  await auth.database.authenticate();
}
const server = createApp(config, auth).listen(config.port, () => {
  console.log(`API escuchando en el puerto ${config.port}`);
});

server.on('error', (err) => {
  console.error('No se pudo iniciar la API:', err.message);
  process.exitCode = 1;
});
