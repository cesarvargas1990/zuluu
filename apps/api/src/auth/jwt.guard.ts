import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import type { PayloadAcceso } from './auth.service';
import { ES_PUBLICO } from './decoradores';

export type RequestAutenticado = Request & { auth: PayloadAcceso };

const NO_AUTENTICADO = 'Debe iniciar sesión.';

/** Valida el token de acceso y que la sesión y el usuario sigan activos (revocación inmediata). */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const [tipo, token] = (req.get('authorization') ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException(NO_AUTENTICADO);

    let payload: PayloadAcceso;
    try {
      payload = await this.jwt.verifyAsync<PayloadAcceso>(token);
    } catch {
      throw new UnauthorizedException(NO_AUTENTICADO);
    }
    const sesion = await this.prisma.sesion.findUnique({
      where: { id: payload.sid },
      select: { revocadaEn: true, usuario: { select: { activo: true } } },
    });
    if (!sesion || sesion.revocadaEn || !sesion.usuario.activo) {
      throw new UnauthorizedException(NO_AUTENTICADO);
    }
    req.auth = payload;
    Object.assign(contexto.actual(), {
      usuarioId: payload.sub,
      sesionId: payload.sid,
      esSuperadmin: payload.sa,
    });
    return true;
  }
}
