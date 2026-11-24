import { Router } from 'express';
import type { RequestHandler } from 'express';
import { HttpError } from '../http-error.ts';
import { requireAuth, requireRoles } from '../middleware/auth.ts';
import type { ApplicationModels, AuthService } from '../services/auth.service.ts';
import { createPacienteService } from '../services/paciente.service.ts';
import { parsePacienteId, parsePacienteListQuery } from '../schemas/paciente.schema.ts';

export type PacienteRouteDependencies = {
  models: ApplicationModels;
  authService: AuthService;
};

const unavailable: RequestHandler = (_request, _response, next) => {
  next(new HttpError(503, 'SERVICE_UNAVAILABLE', 'La API de pacientes no está disponible temporalmente'));
};

export function createUnavailablePacientesRouter() {
  const router = Router();
  router.get('/pacientes', unavailable);
  router.get('/pacientes/:id', unavailable);
  return router;
}

export function createPacientesRouter(dependencies: PacienteRouteDependencies) {
  const router = Router();
  const pacientes = createPacienteService(dependencies.models);
  const authenticate = requireAuth(dependencies.authService);
  const authorize = requireRoles('paciente', 'profesional', 'administrador');

  router.get('/pacientes', authenticate, authorize, async (request, response) => {
    const query = parsePacienteListQuery(request.query);
    if (!request.auth) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
    }
    const result = await pacientes.list(query, request.auth);
    response.status(200).json(result);
  });

  router.get('/pacientes/:id', authenticate, authorize, async (request, response) => {
    if (!request.auth) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
    }
    const rawId = request.params.id;
    if (typeof rawId !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
        { field: 'id', message: 'Debe ser un UUID válido' },
      ]);
    }
    const patient = await pacientes.get(parsePacienteId(rawId), request.auth);
    if (!patient) {
      throw new HttpError(404, 'NOT_FOUND', 'Paciente no encontrado');
    }
    response.status(200).json({ data: patient });
  });

  return router;
}
