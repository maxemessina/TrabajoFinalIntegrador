import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.routes.ts';
import { notFound, errorHandler } from './middleware/errors.ts';
import type { AppConfig } from './config.ts';
import { createAuthRouter, createUnavailableAuthRouter } from './routes/auth.routes.ts';
import type { AuthRouteDependencies } from './routes/auth.routes.ts';
import { createPacientesRouter, createUnavailablePacientesRouter } from './routes/pacientes.routes.ts';
import { createAuthService } from './services/auth.service.ts';
import { createMockEmailService } from './services/email.service.ts';
import { defineModels } from './models/index.ts';

export function createApp(config: Pick<AppConfig, 'corsOrigin'>, auth?: AuthRouteDependencies) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || origin === config.corsOrigin),
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', healthRoutes);
  if (auth) {
    const models = defineModels(auth.database);
    const authService = createAuthService(
      auth.database,
      auth.jwtSecret,
      auth.emailService ?? createMockEmailService(),
      models,
    );
    app.use('/api/v1', createAuthRouter(auth, authService));
    app.use('/api/v1', createPacientesRouter({ models, authService }));
  } else {
    app.use('/api/v1', createUnavailableAuthRouter());
    app.use('/api/v1', createUnavailablePacientesRouter());
  }
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
