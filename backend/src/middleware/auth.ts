import type { RequestHandler } from 'express';
import { HttpError } from '../http-error.ts';
import type { CodigoRol } from '../models/Rol.ts';
import type { createAuthService } from '../services/auth.service.ts';
import type { PublicUser } from '../services/auth.service.ts';

export type AuthIdentity = {
  userId: string;
  roles: CodigoRol[];
  user: PublicUser;
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthIdentity;
  }
}

type AuthService = ReturnType<typeof createAuthService>;

export function requireAuth(authService: AuthService): RequestHandler {
  return async (request, _response, next) => {
    const header = request.get('authorization');
    const match = header?.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
    if (!match?.[1]) {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Autenticación requerida'));
    }
    const claims = await authService.verifyAccessToken(match[1]);
    if (!claims) {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'El token no es válido o expiró'));
    }
    const identity = await authService.resolveIdentity(claims.userId);
    if (!identity) {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'La sesión ya no es válida'));
    }
    request.auth = { userId: claims.userId, roles: identity.roles, user: identity.user };
    return next();
  };
}

export function requireRoles(...required: CodigoRol[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Autenticación requerida'));
    }
    if (!required.some((role) => request.auth?.roles.includes(role))) {
      return next(new HttpError(403, 'FORBIDDEN', 'No tiene permisos para esta operación'));
    }
    return next();
  };
}
