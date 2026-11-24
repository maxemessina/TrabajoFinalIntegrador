import { createApp } from './app.ts';
import { loadEnv, readConfig } from './config.ts';

loadEnv();
const config = readConfig();
const server = createApp(config).listen(config.port, () => {
  console.log(`API escuchando en el puerto ${config.port}`);
});

server.on('error', (err) => {
  console.error('No se pudo iniciar la API:', err.message);
  process.exitCode = 1;
});
