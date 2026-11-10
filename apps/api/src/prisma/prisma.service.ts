import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cliente Prisma conectado con el rol de aplicación (APP_DATABASE_URL, sujeto a RLS).
 * Toda consulta a datos de un condominio DEBE pasar por `withTenant`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ datasourceUrl: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Ejecuta `fn` en una transacción con `app.condominio_id` fijado (local a la transacción). */
  async withTenant<T>(
    condominioId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!UUID_RE.test(condominioId)) throw new Error('condominioId inválido');
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.condominio_id', ${condominioId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Transacción marcada como superadmin: habilita las funciones de lectura entre condominios
   * (`app_condominios`, `app_membresias_todas`). Llamar SOLO tras verificar `usuario.es_superadmin`.
   */
  async comoSuperadmin<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.superadmin', 'true', true)`;
      return fn(tx);
    });
  }
}
