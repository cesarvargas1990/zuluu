import { Injectable } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';

export const PARAM_MFA_GLOBAL = 'mfa_global';

@Injectable()
export class ParametrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Control global de 2FA. Si el parámetro falta o es ilegible se considera ENCENDIDO (falla cerrada). */
  async mfaGlobal(): Promise<boolean> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { clave: PARAM_MFA_GLOBAL } });
    return p?.valor === false ? false : true;
  }

  async obtenerMfa() {
    const p = await this.prisma.parametroSistema.findUnique({ where: { clave: PARAM_MFA_GLOBAL } });
    const autor = p?.actualizadoPor
      ? await this.prisma.usuario.findUnique({
          where: { id: p.actualizadoPor },
          select: { nombre: true },
        })
      : null;
    return {
      global: p?.valor === false ? false : true,
      actualizadoEn: p?.updatedAt ?? null,
      actualizadoPorNombre: autor?.nombre ?? null,
    };
  }

  async cambiarMfaGlobal(activo: boolean, actorId: string | null) {
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.parametroSistema.findUnique({ where: { clave: PARAM_MFA_GLOBAL } });
      const antes = actual?.valor === false ? false : true;
      if (antes === activo) return; // sin cambio, sin ruido en la bitácora
      await tx.parametroSistema.update({
        where: { clave: PARAM_MFA_GLOBAL },
        data: { valor: activo, actualizadoPor: actorId },
      });
      await this.auditoria.registrar(tx, {
        accion: 'parametros.mfa_global_cambiado',
        objetoTipo: 'parametro_sistema',
        objetoId: PARAM_MFA_GLOBAL,
        actorId,
        antes: { global: antes },
        despues: { global: activo },
      });
    });
    return this.obtenerMfa();
  }
}
