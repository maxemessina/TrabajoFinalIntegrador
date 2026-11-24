import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ConnectionError } from 'sequelize';
import { HttpError } from '../http-error.ts';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' },
  });
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof HttpError) {
    const error: { code: string; message: string; details?: Array<{ field: string; message: string }> } = {
      code: err.code,
      message: err.message,
    };
    if (err.details) {
      error.details = err.details;
    }
    return res.status(err.status).json({ error });
  }
  if (err instanceof ConnectionError) {
    console.error('Error de conexión con PostgreSQL');
    return res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible temporalmente' },
    });
  }

  const type = typeof err === 'object' && err !== null && 'type' in err ? err.type : undefined;
  if (type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido' },
    });
  }
  if (type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo de la solicitud es demasiado grande' },
    });
  }
  if (type === 'charset.unsupported' || type === 'encoding.unsupported') {
    return res.status(415).json({
      error: { code: 'UNSUPPORTED_ENCODING', message: 'La codificación de la solicitud no es compatible' },
    });
  }

  console.error('Error interno:', err instanceof Error ? err.name : 'UnknownError');
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
  });
};
