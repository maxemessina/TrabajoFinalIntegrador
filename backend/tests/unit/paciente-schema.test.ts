import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../../src/http-error.ts';
import { parsePacienteId, parsePacienteListQuery } from '../../src/schemas/paciente.schema.ts';

test('la lista de pacientes aplica valores predeterminados y normaliza filtros', () => {
  assert.deepEqual(parsePacienteListQuery({}), {
    page: 1,
    limit: 10,
    sortBy: 'apellido',
    order: 'asc',
  });
  assert.deepEqual(parsePacienteListQuery({
    q: '  Ana  ', activo: 'false', page: '2', limit: '50', sortBy: 'fecha_nacimiento', order: 'desc',
  }), {
    q: 'Ana',
    activo: false,
    page: 2,
    limit: 50,
    sortBy: 'fecha_nacimiento',
    order: 'desc',
  });
});

for (const query of [
  { campo: 'desconocido' },
  { q: '  ' },
  { q: 'x'.repeat(101) },
  { activo: '1' },
  { page: '0' },
  { page: '1.5' },
  { page: ['1', '2'] },
  { limit: '101' },
  { sortBy: 'email' },
  { order: 'DESC' },
]) {
  test(`rechaza parámetros de lista inválidos: ${JSON.stringify(query)}`, () => {
    assert.throws(() => parsePacienteListQuery(query), (error: unknown) =>
      error instanceof HttpError && error.status === 400);
  });
}

test('el identificador de paciente debe tener formato UUID', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(parsePacienteId(id), id);
  assert.throws(() => parsePacienteId('no-es-un-uuid'), (error: unknown) =>
    error instanceof HttpError && error.status === 400);
});
