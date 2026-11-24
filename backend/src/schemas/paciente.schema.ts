import { HttpError } from '../http-error.ts';
import { birthDateField } from './auth.schema.ts';

const sortFields = ['id', 'nombre', 'apellido', 'fecha_nacimiento', 'creado_en'] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type PacienteSortField = typeof sortFields[number];

export type PacienteListQuery = {
  q?: string;
  activo?: boolean;
  page: number;
  limit: number;
  sortBy: PacienteSortField;
  order: 'asc' | 'desc';
};

function invalid(field: string, message: string): never {
  throw new HttpError(400, 'VALIDATION_ERROR', 'Los parámetros de consulta no son válidos', [
    { field, message },
  ]);
}

function queryString(query: Record<string, unknown>, field: string): string | undefined {
  const value = query[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return invalid(field, 'Debe especificarse una sola vez como texto');
  }
  return value;
}

function positiveInteger(value: string | undefined, field: string, fallback: number, maximum?: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!/^[1-9]\d*$/.test(value)) {
    return invalid(field, 'Debe ser un entero positivo');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (maximum !== undefined && number > maximum)) {
    return invalid(field, maximum === undefined ? 'Está fuera del rango permitido' : `No puede superar ${maximum}`);
  }
  return number;
}

export function parsePacienteListQuery(value: unknown): PacienteListQuery {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid('query', 'Los parámetros de consulta no son válidos');
  }
  const query = value as Record<string, unknown>;
  const allowed = ['q', 'activo', 'page', 'limit', 'sortBy', 'order'];
  const unknown = Object.keys(query).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los parámetros de consulta no son válidos', unknown.map((field) => ({
      field,
      message: 'Parámetro desconocido',
    })));
  }

  const rawSearch = queryString(query, 'q');
  const search = rawSearch?.trim();
  if (rawSearch !== undefined && (!search || search.length > 100)) {
    return invalid('q', 'Debe tener entre 1 y 100 caracteres');
  }
  const rawActive = queryString(query, 'activo');
  if (rawActive !== undefined && rawActive !== 'true' && rawActive !== 'false') {
    return invalid('activo', 'Debe ser true o false');
  }
  const rawSortBy = queryString(query, 'sortBy');
  if (rawSortBy !== undefined && !sortFields.includes(rawSortBy as PacienteSortField)) {
    return invalid('sortBy', `Debe ser uno de: ${sortFields.join(', ')}`);
  }
  const rawOrder = queryString(query, 'order');
  if (rawOrder !== undefined && rawOrder !== 'asc' && rawOrder !== 'desc') {
    return invalid('order', 'Debe ser asc o desc');
  }

  const page = positiveInteger(queryString(query, 'page'), 'page', 1);
  const limit = positiveInteger(queryString(query, 'limit'), 'limit', 10, 100);
  if ((page - 1) * limit > Number.MAX_SAFE_INTEGER) {
    return invalid('page', 'Está fuera del rango permitido');
  }

  return {
    ...(search ? { q: search } : {}),
    ...(rawActive !== undefined ? { activo: rawActive === 'true' } : {}),
    page,
    limit,
    sortBy: rawSortBy as PacienteSortField | undefined ?? 'apellido',
    order: rawOrder as 'asc' | 'desc' | undefined ?? 'asc',
  };
}

export function parsePacienteId(value: string): string {
  if (!uuidPattern.test(value)) {
    return invalid('id', 'Debe ser un UUID válido');
  }
  return value;
}

export function parsePacienteCreate(value: unknown): { usuario_id: string; fecha_nacimiento?: string | null } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos');
  }
  const body = value as Record<string, unknown>;
  const unknown = Object.keys(body).filter((field) => !['usuario_id', 'fecha_nacimiento'].includes(field));
  if (unknown.length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', unknown.map((field) => ({
      field,
      message: 'Campo desconocido',
    })));
  }
  const userId = body.usuario_id;
  if (typeof userId !== 'string' || !uuidPattern.test(userId)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field: 'usuario_id', message: 'Debe ser un UUID válido' },
    ]);
  }
  const birthDate = birthDateField(body);
  return {
    usuario_id: userId,
    ...(birthDate !== undefined ? { fecha_nacimiento: birthDate } : {}),
  };
}
