import { SignJWT } from 'jose';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessTokenLifetimeSeconds, createAccessTokenService } from '../../src/services/access-token.service.ts';

const secret = 'secreto-de-prueba-aleatorio-de-32-bytes';
const userId = '11111111-1111-4111-8111-111111111111';

test('el JWT de acceso verifica sujeto, expiración e identidad sin confiar roles del token', async () => {
  const service = createAccessTokenService(secret);
  const token = await service.issue(userId);
  const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
  assert.equal(claims.sub, userId);
  assert.equal(claims.iss, 'portal-salud');
  assert.equal(claims.aud, 'portal-salud-api');
  assert.equal(claims.exp, claims.iat as number + accessTokenLifetimeSeconds);
  assert.equal('roles' in claims, false);
  assert.deepEqual(await service.verify(token), { userId });
});

test('JWT inválidos, alterados, sobredimensionados o firmados con otra clave se rechazan', async () => {
  const service = createAccessTokenService(secret);
  const token = await service.issue(userId);
  const parts = token.split('.');
  const tampered = `${parts[0]}.${parts[1]}.invalid`;
  assert.equal(await service.verify(tampered), null);
  assert.equal(await service.verify(`${token}x`), null);
  assert.equal(await service.verify('no-es-un-jwt'), null);
  assert.equal(await service.verify('x'.repeat(8193)), null);
  assert.equal(await createAccessTokenService(`${secret}-otra`).verify(token), null);
  await assert.rejects(service.issue('id-invalido'), /UUID/);
});

test('JWT expirado y con audiencia incorrecta no verifica', async () => {
  const key = new TextEncoder().encode(secret);
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('portal-salud')
    .setAudience('portal-salud-api')
    .setIssuedAt(1)
    .setExpirationTime(2)
    .sign(key);
  const wrongAudience = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('portal-salud')
    .setAudience('otra-api')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  const service = createAccessTokenService(secret);
  assert.equal(await service.verify(expired), null);
  assert.equal(await service.verify(wrongAudience), null);
});

test('la creación de tokens requiere una clave de al menos 32 bytes', () => {
  assert.throws(() => createAccessTokenService('corta'), /JWT_SECRET/);
  assert.throws(() => createAccessTokenService(`${secret} `), /JWT_SECRET/);
});
