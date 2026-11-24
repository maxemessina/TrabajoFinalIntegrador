import { Router } from 'express';
import type { RequestHandler } from 'express';
import { HttpError } from '../http-error.ts';
import { requireAuth } from '../middleware/auth.ts';
import { parseLogin, parsePasswordReset, parseProfileUpdate, parseRecoveryRequest, parseRegistration } from '../schemas/auth.schema.ts';
import { createAuthService } from '../services/auth.service.ts';
import type { AuthService } from '../services/auth.service.ts';
import type { EmailService } from '../services/email.service.ts';
import { createMockEmailService } from '../services/email.service.ts';
import type { Sequelize } from 'sequelize';

export type AuthRouteDependencies = {
  database: Sequelize;
  jwtSecret: string;
  emailService?: EmailService;
};

const unavailable: RequestHandler = (_request, _response, next) => {
  next(new HttpError(503, 'SERVICE_UNAVAILABLE', 'La autenticación no está disponible temporalmente'));
};

export function createUnavailableAuthRouter() {
  const router = Router();
  router.post('/auth/registro', unavailable);
  router.post('/auth/login', unavailable);
  router.post('/auth/recuperacion', unavailable);
  router.post('/auth/restablecimiento', unavailable);
  router.get('/me', unavailable);
  router.patch('/me', unavailable);
  return router;
}

export function createAuthRouter(dependencies: AuthRouteDependencies, authService?: AuthService) {
  const router = Router();
  const service = authService ?? createAuthService(
    dependencies.database,
    dependencies.jwtSecret,
    dependencies.emailService ?? createMockEmailService(),
  );
  const authenticate = requireAuth(service);

  router.post('/auth/registro', async (request, response) => {
    const result = await service.register(parseRegistration(request.body));
    response
      .status(201)
      .location(`/api/v1/pacientes/${result.patient.id}`)
      .json({ data: { usuario: result.user, paciente: result.patient } });
  });

  router.post('/auth/login', async (request, response) => {
    const input = parseLogin(request.body);
    const result = await service.login(input.email, input.password);
    response.status(200).json({
      data: {
        access_token: result.accessToken,
        token_type: result.tokenType,
        expires_in: result.expiresIn,
        usuario: result.user,
      },
    });
  });

  router.post('/auth/recuperacion', async (request, response) => {
    const input = parseRecoveryRequest(request.body);
    await service.requestPasswordReset(input.email);
    response.status(202).json({
      data: { message: 'Si la cuenta existe y está activa, recibirá instrucciones de recuperación.' },
    });
  });

  router.post('/auth/restablecimiento', async (request, response) => {
    const input = parsePasswordReset(request.body);
    await service.resetPassword(input.token, input.password);
    response.status(200).json({
      data: { message: 'La contraseña se restableció correctamente.' },
    });
  });

  router.get('/me', authenticate, (request, response) => {
    if (!request.auth) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
    }
    response.status(200).json({ data: request.auth.user });
  });

  router.patch('/me', authenticate, async (request, response) => {
    if (!request.auth) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
    }
    const changes = parseProfileUpdate(request.body);
    const user = await service.updateProfile(request.auth.userId, changes);
    response.status(200).json({ data: user });
  });

  return router;
}
