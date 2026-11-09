import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { RequestAutenticado } from '../auth/jwt.guard';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIERE_PERMISO, type MetaPermiso } from './decoradores';
import { evaluarPermiso } from './evaluar-permiso';

const SIN_PERMISO = 'No tiene permiso para esta acción.';

/** Aplica `@RequierePermiso(area, accion)` con denegación por defecto. */
@Injectable()
export class PermisoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<MetaPermiso>(REQUIERE_PERMISO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!meta) return true;

    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const c = contexto.actual();
    const condominioId = c.condominioId!;
    const ruta = `${req.method} ${req.route?.path ?? req.path}`;
    const expedienteId =
      typeof req.params.expedienteId === 'string' ? req.params.expedienteId : undefined;

    if (c.accesoExcepcionalId) {
      const permitido = meta.accion === 'leer';
      await this.auditoria.registrarSuelto({
        accion: permitido ? 'acceso_excepcional.usado' : 'autorizacion.denegado',
        objetoTipo: 'acceso_excepcional',
        objetoId: c.accesoExcepcionalId,
        condominioId,
        despues: { ruta, area: meta.area, accion: meta.accion },
      });
      if (!permitido) throw new ForbiddenException(SIN_PERMISO);
      return true;
    }

    const permisos = await this.prisma.withTenant(condominioId, (tx) =>
      tx.permiso.findMany({
        where: { membresiaId: { in: c.membresiaIds ?? [] }, revocadoEn: null },
        select: { area: true, accion: true, efecto: true, expedienteId: true },
      }),
    );
    const r = evaluarPermiso({
      roles: c.roles ?? [],
      permisos,
      area: meta.area,
      accion: meta.accion,
      expedienteId,
    });
    if (!r.permitido) {
      await this.auditoria.registrarSuelto({
        accion: 'autorizacion.denegado',
        objetoTipo: 'ruta',
        objetoId: ruta,
        condominioId,
        despues: { area: meta.area, accion: meta.accion, expedienteId, motivo: r.motivo },
      });
      throw new ForbiddenException(SIN_PERMISO);
    }
    return true;
  }
}
