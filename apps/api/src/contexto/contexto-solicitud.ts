import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Rol } from '@zulu/shared';
import type { NextFunction, Request, Response } from 'express';

export interface ContextoSolicitud {
  ip?: string;
  userAgent?: string;
  usuarioId?: string;
  sesionId?: string;
  esSuperadmin?: boolean;
  condominioId?: string;
  membresiaIds?: string[];
  roles?: Rol[];
  accesoExcepcionalId?: string;
}

const als = new AsyncLocalStorage<ContextoSolicitud>();

export const contexto = {
  /** Contexto de la petición en curso (vacío fuera de una petición HTTP). */
  actual: (): ContextoSolicitud => als.getStore() ?? {},
  ejecutar: <T>(ctx: ContextoSolicitud, fn: () => T): T => als.run(ctx, fn),
};

@Injectable()
export class ContextoMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    contexto.ejecutar({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined }, next);
  }
}
