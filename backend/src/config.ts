import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export type AppConfig = {
  port: number;
  corsOrigin: string;
};

export function loadEnv() {
  const result = dotenv.config({
    path: fileURLToPath(new URL('../../.env', import.meta.url)),
    quiet: true,
  });

  const error: unknown = result.error;
  if (error && !(typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
    throw error;
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV debe ser development, test o production');
  }

  const portValue = env.PORT ?? '3000';
  if (!/^\d+$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535');
  }

  const corsOrigin = env.CORS_ORIGIN ?? (nodeEnv === 'production' ? '' : 'http://localhost:5173');
  let url: URL;
  try {
    url = new URL(corsOrigin);
  } catch {
    throw new Error('CORS_ORIGIN debe ser un origen HTTP o HTTPS válido');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== corsOrigin) {
    throw new Error('CORS_ORIGIN debe ser un origen HTTP o HTTPS sin ruta ni barra final');
  }

  return { port: Number(portValue), corsOrigin };
}
