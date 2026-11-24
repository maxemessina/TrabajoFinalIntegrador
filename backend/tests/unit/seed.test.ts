import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('el comando demo rechaza producción antes de conectar', () => {
  const script = fileURLToPath(new URL('../../src/database/seed.ts', import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'no-es-una-url' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no usar en producción/);
  assert.doesNotMatch(result.stderr, /DATABASE_URL/);
});
