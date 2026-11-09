import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROLES } from './roles';

describe('ROLES', () => {
  it('coincide con el enum Rol de Prisma', () => {
    const schema = readFileSync(
      new URL('../../../apps/api/prisma/schema.prisma', import.meta.url),
      'utf8',
    );
    const body = /enum Rol \{([^}]*)\}/.exec(schema)?.[1] ?? '';
    const prismaRoles = body.split(/\s+/).filter(Boolean);
    expect(prismaRoles).toEqual([...ROLES]);
  });
});
