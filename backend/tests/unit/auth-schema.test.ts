import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../../src/http-error.ts';
import { parseLogin, parsePasswordReset, parseProfileUpdate, parseRegistration } from '../../src/schemas/auth.schema.ts';

test('el registro normaliza campos de texto y permite opcionales nulos', () => {
  assert.deepEqual(parseRegistration({
    nombre: '  Ana  ',
    apellido: ' Ejemplo ',
    email: ' Ana@Example.invalid ',
    password: '  contraseña larga  ',
    telefono: null,
    fecha_nacimiento: null,
  }), {
    nombre: 'Ana',
    apellido: 'Ejemplo',
    email: 'Ana@Example.invalid',
    password: '  contraseña larga  ',
    telefono: null,
    fecha_nacimiento: null,
  });
});

test('el registro rechaza campos desconocidos, email inválido y fecha futura', () => {
  for (const body of [
    { nombre: 'Ana', apellido: 'Ejemplo', email: 'ana@example.invalid', password: 'contraseña larga', admin: true },
    { nombre: 'Ana', apellido: 'Ejemplo', email: 'no-email', password: 'contraseña larga' },
    { nombre: 'Ana', apellido: 'Ejemplo', email: 'ana@example.invalid', password: 'contraseña larga', fecha_nacimiento: '2099-01-01' },
  ]) {
    assert.throws(() => parseRegistration(body), HttpError);
  }
});

test('login y restablecimiento rechazan cuerpos inválidos o con campos adicionales', () => {
  assert.throws(() => parseLogin({ email: 'ana@example.invalid', password: 'ok', rol: 'administrador' }), HttpError);
  assert.throws(() => parsePasswordReset({ token: 'invalido', password: 'contraseña larga' }), HttpError);
  assert.throws(() => parseProfileUpdate({ email: 'otro@example.invalid' }), HttpError);
  assert.throws(() => parseProfileUpdate({}), HttpError);
  assert.deepEqual(parseProfileUpdate({ telefono: null }), { telefono: null });
});
