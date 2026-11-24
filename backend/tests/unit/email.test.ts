import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockEmailService } from '../../src/services/email.service.ts';

test('el correo mock no registra destinatario ni token', async (context) => {
  const log = context.mock.method(console, 'info', () => {});
  const service = createMockEmailService();
  await service.sendPasswordReset({
    recipient: 'privado@example.invalid',
    token: 'token-secreto-de-prueba',
    expiresAt: new Date(),
  });
  assert.equal(log.mock.callCount(), 0);
});
