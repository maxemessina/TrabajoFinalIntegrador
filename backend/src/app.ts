import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.routes.ts';
import { notFound, errorHandler } from './middleware/errors.ts';
import type { AppConfig } from './config.ts';
import { createAuthRouter, createUnavailableAuthRouter } from './routes/auth.routes.ts';
import type { AuthRouteDependencies } from './routes/auth.routes.ts';

export function createApp(config: Pick<AppConfig, 'corsOrigin'>, auth?: AuthRouteDependencies) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || origin === config.corsOrigin),
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', healthRoutes);
  app.use('/api/v1', auth ? createAuthRouter(auth) : createUnavailableAuthRouter());
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
