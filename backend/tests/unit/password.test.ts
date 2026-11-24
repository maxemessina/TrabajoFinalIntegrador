import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, PasswordValidationError, verifyPassword } from '../../src/services/password.service.ts';

test('el hash de contraseña usa sal aleatoria y no conserva el texto original', async () => {
  const password = 'contraseña-de-prueba';
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);
  assert.match(firstHash, /^scrypt\$32768\$8\$1\$/);
  assert.notEqual(firstHash, secondHash);
  assert.doesNotMatch(firstHash, /contraseña-de-prueba/);
  assert.equal(await verifyPassword(password, firstHash), true);
});

test('la contraseña equivocada y los hashes inválidos no verifican', async () => {
  const hash = await hashPassword('contraseña-valida');
  assert.equal(await verifyPassword('otra-contraseña', hash), false);
  assert.equal(await verifyPassword('contraseña-valida', 'hash-invalido'), false);
  assert.equal(await verifyPassword('contraseña-valida', 'scrypt$999999999999$8$1$abc$def'), false);
});

test('el hash rechaza contraseñas fuera de los límites sin recortarlas', async () => {
  for (const password of ['corta', 'a'.repeat(129), '😀'.repeat(129)]) {
    await assert.rejects(hashPassword(password), PasswordValidationError);
  }
  assert.equal(await verifyPassword('corta', 'hash-invalido'), false);
});
