import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { RequestAutenticado } from '../auth/jwt.guard';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import {
  REQUIERE_CONDOMINIO,
  REQUIERE_PERMISO,
  type MetaCondominio,
  type MetaPermiso,
} from './decoradores';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resuelve el condominio de la petición y la relación del usuario con él.
 * Sin membresía activa ⇒ 404 (no revela que el condominio o recurso existe).
 * Superadmin ⇒ gestión permitida; datos solo con acceso excepcional vigente.
 */
@Injectable()
export class CondominioGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    const permiso = this.reflector.getAllAndOverride<MetaPermiso>(REQUIERE_PERMISO, objetivos);
    const meta = this.reflector.getAllAndOverride<MetaCondominio>(REQUIERE_CONDOMINIO, objetivos);
    if (!permiso && !meta) return true;

    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const condominioId = req.get('x-condominio-id');
    if (!condominioId || !UUID.test(condominioId)) {
      throw new BadRequestException('Falta o es inválido el encabezado X-Condominio-Id.');
    }
    const c = contexto.actual();
    const membresias = await this.prisma.withTenant(condominioId, (tx) =>
      tx.membresia.findMany({ where: { usuarioId: req.auth.sub, activo: true } }),
    );

    if (membresias.length > 0) {
      Object.assign(c, {
        condominioId,
        membresiaIds: membresias.map((m) => m.id),
        roles: membresias.map((m) => m.rol),
      });
    } else if (req.auth.sa) {
      Object.assign(c, { condominioId, membresiaIds: [], roles: [] });
      if (!meta?.gestion) await this.exigirAccesoExcepcional(condominioId, req.auth.sub);
    } else {
      throw new NotFoundException('Recurso no encontrado.');
    }

    if (meta?.gestion && !req.auth.sa && !c.roles?.includes('ADMINISTRADORA')) {
      await this.auditoria.registrarSuelto({
        accion: 'autorizacion.denegado',
        objetoTipo: 'ruta',
        objetoId: `${req.method} ${req.route?.path ?? req.path}`,
        condominioId,
      });
      throw new ForbiddenException('No tiene permiso para esta acción.');
    }
    return true;
  }

  private async exigirAccesoExcepcional(condominioId: string, usuarioId: string) {
    const ahora = new Date();
    const accesos = await this.prisma.withTenant(condominioId, (tx) =>
      tx.accesoExcepcional.findMany({
        where: { usuarioId, revocadoEn: null },
        orderBy: { venceEn: 'desc' },
        take: 1,
      }),
    );
    const ultimo = accesos[0];
    if (ultimo && ultimo.venceEn > ahora) {
      contexto.actual().accesoExcepcionalId = ultimo.id;
      return;
    }
    await this.auditoria.registrarSuelto({
      accion: ultimo ? 'acceso_excepcional.vencido' : 'autorizacion.denegado',
      objetoTipo: ultimo ? 'acceso_excepcional' : 'condominio',
      objetoId: ultimo?.id ?? condominioId,
      condominioId,
    });
    throw new ForbiddenException(
      'Requiere un acceso excepcional vigente para ver datos de este condominio.',
    );
  }
}
