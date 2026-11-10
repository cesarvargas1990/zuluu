import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { RequestAutenticado } from '../auth/jwt.guard';

/** Solo el superadministrador ZULU (la sesión ya pasó JwtGuard y MfaGuard). */
@Injectable()
export class SuperadminGuard implements CanActivate {
  constructor(private readonly auditoria: AuditoriaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    if (req.auth?.sa) return true;
    await this.auditoria.registrarSuelto({
      accion: 'autorizacion.denegado',
      objetoTipo: 'ruta',
      objetoId: `${req.method} ${req.route?.path ?? req.path}`,
    });
    throw new ForbiddenException(
      'Solo el superadministrador ZULU puede administrar usuarios y condominios.',
    );
  }
}
