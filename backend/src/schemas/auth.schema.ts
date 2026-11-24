import { HttpError } from '../http-error.ts';

type JsonObject = Record<string, unknown>;

function objectBody(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos');
  }
  return value as JsonObject;
}

function rejectUnknownFields(body: JsonObject, allowed: readonly string[]): void {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', unknown.map((field) => ({
      field,
      message: 'Campo desconocido',
    })));
  }
}

function stringField(body: JsonObject, field: string): string {
  const value = body[field];
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field, message: 'Debe ser texto' },
    ]);
  }
  return value;
}

function requiredText(body: JsonObject, field: string, maximum: number): string {
  const value = stringField(body, field).trim();
  if (value.length < 1 || value.length > maximum) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field, message: `Debe tener entre 1 y ${maximum} caracteres` },
    ]);
  }
  return value;
}

function emailField(body: JsonObject): string {
  const email = stringField(body, 'email').trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field: 'email', message: 'Debe ser un email válido de hasta 254 caracteres' },
    ]);
  }
  return email;
}

function passwordField(body: JsonObject, field: string, registration: boolean): string {
  const password = stringField(body, field);
  const characters = [...password].length;
  const valid = registration
    ? characters >= 10 && characters <= 128 && Buffer.byteLength(password, 'utf8') <= 512
    : password.length > 0 && password.length <= 512;
  if (!valid) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field, message: registration
        ? 'Debe tener entre 10 y 128 caracteres'
        : 'Debe tener entre 1 y 512 caracteres' },
    ]);
  }
  return password;
}

function nullableText(body: JsonObject, field: string, maximum: number): string | null | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > maximum) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field, message: `Debe ser texto de hasta ${maximum} caracteres o null` },
    ]);
  }
  return value.trim();
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year ?? 0, (month ?? 1) - 1, day ?? 0);
  return date.toISOString().slice(0, 10) === value;
}

export function birthDateField(body: JsonObject): string | null | undefined {
  const value = body.fecha_nacimiento;
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'string' || !validDate(value) || value > new Date().toISOString().slice(0, 10)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field: 'fecha_nacimiento', message: 'Debe ser una fecha válida que no sea futura' },
    ]);
  }
  return value;
}

export function parseRegistration(value: unknown) {
  const body = objectBody(value);
  rejectUnknownFields(body, ['nombre', 'apellido', 'email', 'password', 'telefono', 'fecha_nacimiento']);
  const telefono = nullableText(body, 'telefono', 30);
  const fechaNacimiento = birthDateField(body);
  return {
    nombre: requiredText(body, 'nombre', 100),
    apellido: requiredText(body, 'apellido', 100),
    email: emailField(body),
    password: passwordField(body, 'password', true),
    ...(telefono !== undefined ? { telefono } : {}),
    ...(fechaNacimiento !== undefined ? { fecha_nacimiento: fechaNacimiento } : {}),
  };
}

export function parseLogin(value: unknown) {
  const body = objectBody(value);
  rejectUnknownFields(body, ['email', 'password']);
  return { email: emailField(body), password: passwordField(body, 'password', false) };
}

export function parseRecoveryRequest(value: unknown) {
  const body = objectBody(value);
  rejectUnknownFields(body, ['email']);
  return { email: emailField(body) };
}

export function parsePasswordReset(value: unknown) {
  const body = objectBody(value);
  rejectUnknownFields(body, ['token', 'password']);
  const token = stringField(body, 'token');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'El token no es válido o expiró', [
      { field: 'token', message: 'El token no es válido o expiró' },
    ]);
  }
  return { token, password: passwordField(body, 'password', true) };
}

export function parseProfileUpdate(value: unknown) {
  const body = objectBody(value);
  rejectUnknownFields(body, ['nombre', 'apellido', 'telefono']);
  if (Object.keys(body).length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos');
  }
  const nombre = body.nombre === undefined ? undefined : requiredText(body, 'nombre', 100);
  const apellido = body.apellido === undefined ? undefined : requiredText(body, 'apellido', 100);
  const telefono = nullableText(body, 'telefono', 30);
  return {
    ...(nombre !== undefined ? { nombre } : {}),
    ...(apellido !== undefined ? { apellido } : {}),
    ...(telefono !== undefined ? { telefono } : {}),
  };
}
