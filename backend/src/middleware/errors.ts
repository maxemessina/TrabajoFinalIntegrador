import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' },
  });
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
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

  console.error('Error interno:', err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
  });
};
