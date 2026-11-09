/**
 * Prueba de aceptación obligatoria (§13): un usuario del condominio B
 * no puede recuperar registros del condominio A. Requiere `pnpm db:up` + migraciones.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';

const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const app = new PrismaService();
let a: string;
let b: string;

beforeAll(async () => {
  const suffix = Date.now();
  a = (await owner.condominio.create({ data: { razonSocial: 'Test A', nit: `A-${suffix}` } })).id;
  b = (await owner.condominio.create({ data: { razonSocial: 'Test B', nit: `B-${suffix}` } })).id;
  await owner.auditoria.create({
    data: { condominioId: a, accion: 'test', objetoTipo: 'condominio' },
  });
});

afterAll(async () => {
  await owner.$executeRaw`DELETE FROM auditoria WHERE condominio_id IN (${a}::uuid, ${b}::uuid)`;
  await owner.condominio.deleteMany({ where: { id: { in: [a, b] } } });
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('aislamiento multi-tenant (RLS)', () => {
  it('sin tenant fijado no se ve ningún condominio', async () => {
    expect(await app.condominio.findMany()).toHaveLength(0);
  });

  it('el condominio B no ve datos del condominio A', async () => {
    const visibles = await app.withTenant(b, (tx) => tx.condominio.findMany());
    expect(visibles.map((c) => c.id)).toEqual([b]);
    const audit = await app.withTenant(b, (tx) => tx.auditoria.findMany());
    expect(audit).toHaveLength(0);
  });

  it('el condominio A ve su propia auditoría', async () => {
    const audit = await app.withTenant(a, (tx) => tx.auditoria.findMany());
    expect(audit).toHaveLength(1);
  });

  it('la auditoría es append-only para el rol de aplicación', async () => {
    await expect(
      app.withTenant(a, (tx) => tx.auditoria.deleteMany({ where: { condominioId: a } })),
    ).rejects.toThrow();
  });
});
