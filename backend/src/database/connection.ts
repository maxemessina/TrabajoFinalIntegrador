import { Sequelize } from 'sequelize';

export function readDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL es obligatoria para conectar PostgreSQL');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida');
  }

  if (value !== value.trim() ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname || !url.pathname || url.pathname === '/' || url.hash) {
    throw new Error('DATABASE_URL debe incluir host y nombre de base PostgreSQL, sin fragmento');
  }

  return value;
}

export function createDatabase(databaseUrl: string): Sequelize {
  return new Sequelize(databaseUrl, { logging: false });
}
