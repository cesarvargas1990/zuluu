import { randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Sesion } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { contexto } from '../contexto/contexto-solicitud';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { generarTokenOpaco, sha256 } from './tokens';

const HORA = 3_600_000;
const SESION_INVALIDA = 'Sesión inválida o vencida. Inicie sesión de nuevo.';

/** Sesiones de renovación con rotación por familia y detección de reuso. */
@Injectable()
export class SesionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async crear(usuarioId: string, mfaVerificado: boolean, familia?: { id: string; inicio: Date }) {
    const refreshToken = generarTokenOpaco();
    const ahora = Date.now();
    const inicio = familia?.inicio.getTime() ?? ahora;
    const expiraEn = new Date(
      Math.min(
        ahora + this.env.REFRESH_INACTIVIDAD_HORAS * HORA,
        inicio + this.env.REFRESH_MAX_DIAS * 24 * HORA,
      ),
    );
    const ctx = contexto.actual();
    const sesion = await this.prisma.sesion.create({
      data: {
        usuarioId,
        familiaId: familia?.id ?? randomUUID(),
        refreshHash: sha256(refreshToken),
        mfaVerificado,
        expiraEn,
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 300),
      },
    });
    return { sesion, refreshToken };
  }

  /** Rota el token: el anterior queda reemplazado. Un token ya usado revoca toda la familia. */
  async rotar(refreshToken: string): Promise<{ sesion: Sesion; refreshToken: string }> {
    const actual = await this.prisma.sesion.findUnique({
      where: { refreshHash: sha256(refreshToken) },
    });
    if (!actual) throw new UnauthorizedException(SESION_INVALIDA);

    if (actual.reemplazadaPor) {
      await this.revocarFamilia(actual.familiaId);
      await this.auditoria.registrarSuelto({
        accion: 'auth.reuso_renovacion',
        objetoTipo: 'sesion',
        objetoId: actual.id,
        actorId: actual.usuarioId,
      });
      throw new UnauthorizedException(SESION_INVALIDA);
    }
    if (actual.revocadaEn) throw new UnauthorizedException(SESION_INVALIDA);
    if (actual.expiraEn.getTime() <= Date.now()) throw new UnauthorizedException(SESION_INVALIDA);

    const primera = await this.prisma.sesion.findFirst({
      where: { familiaId: actual.familiaId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const nueva = await this.crear(actual.usuarioId, actual.mfaVerificado, {
      id: actual.familiaId,
      inicio: primera?.createdAt ?? actual.createdAt,
    });
    // Reclamo atómico: si otra petición ya rotó este token, es reuso.
    const { count } = await this.prisma.sesion.updateMany({
      where: { id: actual.id, reemplazadaPor: null, revocadaEn: null },
      data: { reemplazadaPor: nueva.sesion.id },
    });
    if (count === 0) {
      await this.revocarFamilia(actual.familiaId);
      throw new UnauthorizedException(SESION_INVALIDA);
    }
    return nueva;
  }

  async marcarMfaVerificado(sesionId: string) {
    return this.prisma.sesion.update({ where: { id: sesionId }, data: { mfaVerificado: true } });
  }

  async revocarFamilia(familiaId: string) {
    await this.prisma.sesion.updateMany({
      where: { familiaId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  async revocarTodas(usuarioId: string) {
    await this.prisma.sesion.updateMany({
      where: { usuarioId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }
}
