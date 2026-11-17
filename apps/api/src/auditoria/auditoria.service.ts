import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizar } from './sanitizar';

export interface EventoAuditoria {
  accion: string;
  objetoTipo: string;
  objetoId?: string | null;
  condominioId?: string | null;
  actorId?: string | null;
  antes?: unknown;
  despues?: unknown;
}

const json = (v: unknown) =>
  v === undefined ? undefined : (sanitizar(v) as Prisma.InputJsonValue);

/** Bitácora append-only. Usar `registrar(tx, …)` dentro de la misma transacción del cambio. */
@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(tx: Prisma.TransactionClient, e: EventoAuditoria): Promise<void> {
    const ctx = contexto.actual();
    // createMany no usa RETURNING: la fila puede no ser legible en el contexto actual (RLS de SELECT).
    await tx.auditoria.createMany({
      data: {
        accion: e.accion,
        objetoTipo: e.objetoTipo,
        objetoId: e.objetoId ?? null,
        condominioId: e.condominioId ?? null,
        actorId: e.actorId ?? ctx.usuarioId ?? null,
        antes: json(e.antes),
        despues: json(e.despues),
        ip: ctx.ip ?? null,
      },
    });
  }

  /** Varios eventos en una sola inserción (operaciones masivas, p. ej. importaciones). */
  async registrarVarios(tx: Prisma.TransactionClient, eventos: EventoAuditoria[]): Promise<void> {
    if (eventos.length === 0) return;
    const ctx = contexto.actual();
    await tx.auditoria.createMany({
      data: eventos.map((e) => ({
        accion: e.accion,
        objetoTipo: e.objetoTipo,
        objetoId: e.objetoId ?? null,
        condominioId: e.condominioId ?? null,
        actorId: e.actorId ?? ctx.usuarioId ?? null,
        antes: json(e.antes),
        despues: json(e.despues),
        ip: ctx.ip ?? null,
      })),
    });
  }

  /** Evento sin transacción de negocio (login, 403). Con condominio usa su contexto RLS. */
  async registrarSuelto(e: EventoAuditoria): Promise<void> {
    if (e.condominioId) {
      await this.prisma.withTenant(e.condominioId, (tx) => this.registrar(tx, e));
    } else {
      await this.registrar(this.prisma, e);
    }
  }
}
