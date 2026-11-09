import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ES_PUBLICO, PERMITIR_SIN_MFA } from './decoradores';
import type { RequestAutenticado } from './jwt.guard';

/** Perfiles privilegiados sin MFA verificado solo pueden completar el MFA. */
@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) return true;
    if (this.reflector.getAllAndOverride<boolean>(PERMITIR_SIN_MFA, objetivos)) return true;
    const { auth } = ctx.switchToHttp().getRequest<RequestAutenticado>();
    if (auth.mfaReq && !auth.mfa) {
      throw new ForbiddenException('Debe completar la verificación en dos pasos.');
    }
    return true;
  }
}
