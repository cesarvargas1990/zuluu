import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Sesion, Usuario } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ENV, type Env } from '../config/env';
import { ParametrosService } from '../parametros/parametros.service';
import { PrismaService } from '../prisma/prisma.service';
import { membresiasDeUsuario } from './membresias-usuario';
import { obtenerHashSenuelo, verificarPassword } from './password';
import { decidirMfa } from './politica-mfa';
import { SesionesService } from './sesiones.service';

export const MAX_INTENTOS = 5;
export const BLOQUEO_MS = 15 * 60_000;
const CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos.';

/** Claims del token de acceso. */
export interface PayloadAcceso {
  sub: string;
  sid: string;
  /** La sesión completó MFA. */
  mfa: boolean;
  /** El usuario está obligado a usar MFA. */
  mfaReq: boolean;
  sa: boolean;
}

export interface ResultadoLogin {
  accessToken: string;
  refreshToken: string;
  mfaRequerido: boolean;
  mfaConfigurado: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly auditoria: AuditoriaService,
    private readonly jwt: JwtService,
    private readonly parametros: ParametrosService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(emailEntrada: string, password: string): Promise<ResultadoLogin> {
    const email = emailEntrada.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });

    if (!usuario?.passwordHash) {
      await verificarPassword(await obtenerHashSenuelo(), password); // tiempo constante
      await this.auditarFallo(null, email);
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }
    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > Date.now()) {
      await this.auditoria.registrarSuelto({
        accion: 'auth.login_bloqueado',
        objetoTipo: 'usuario',
        objetoId: usuario.id,
        actorId: usuario.id,
      });
      throw new HttpException(
        'Demasiados intentos fallidos. Intente de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const correcta = await verificarPassword(usuario.passwordHash, password);
    if (!correcta || !usuario.activo) {
      await this.registrarIntentoFallido(usuario);
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null },
    });
    const mfaRequerido = await this.requiereMfa(usuario);
    const { sesion, refreshToken } = await this.sesiones.crear(usuario.id, false);
    await this.auditoria.registrarSuelto({
      accion: 'auth.login_exitoso',
      objetoTipo: 'sesion',
      objetoId: sesion.id,
      actorId: usuario.id,
    });
    return {
      accessToken: await this.emitirAcceso(usuario, sesion, mfaRequerido),
      refreshToken,
      mfaRequerido,
      mfaConfigurado: !!usuario.mfaActivadoEn,
    };
  }

  async renovar(refreshToken: string) {
    const nueva = await this.sesiones.rotar(refreshToken);
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: nueva.sesion.usuarioId },
    });
    if (!usuario.activo) {
      await this.sesiones.revocarTodas(usuario.id);
      throw new UnauthorizedException('Sesión inválida o vencida. Inicie sesión de nuevo.');
    }
    return {
      accessToken: await this.emitirAcceso(usuario, nueva.sesion, await this.requiereMfa(usuario)),
      refreshToken: nueva.refreshToken,
    };
  }

  /** Reemite el token de acceso tras un cambio de nivel de sesión (MFA verificado). */
  async reemitir(usuarioId: string, sesionId: string) {
    const [usuario, sesion] = await Promise.all([
      this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } }),
      this.prisma.sesion.findUniqueOrThrow({ where: { id: sesionId } }),
    ]);
    return this.emitirAcceso(usuario, sesion, await this.requiereMfa(usuario));
  }

  async logout(sesionId: string, usuarioId: string) {
    const sesion = await this.prisma.sesion.findUnique({ where: { id: sesionId } });
    if (sesion) await this.sesiones.revocarFamilia(sesion.familiaId);
    await this.auditoria.registrarSuelto({
      accion: 'auth.logout',
      objetoTipo: 'sesion',
      objetoId: sesionId,
      actorId: usuarioId,
    });
  }

  /**
   * ¿Debe este usuario usar verificación en dos pasos? La regla global prima sobre el ajuste
   * individual (ver `decidirMfa`). Se consulta en cada login y renovación: los cambios aplican de inmediato.
   */
  async requiereMfa(
    usuario: Pick<Usuario, 'id' | 'esSuperadmin' | 'mfaPolitica'>,
  ): Promise<boolean> {
    const global = await this.parametros.mfaGlobal();
    // Solo se consultan los roles cuando la decisión depende de ellos.
    const dependeDelRol = global && usuario.mfaPolitica === 'HEREDAR' && !usuario.esSuperadmin;
    const roles = dependeDelRol
      ? (await membresiasDeUsuario(this.prisma, usuario.id)).map((m) => m.rol)
      : [];
    return decidirMfa({
      global,
      politica: usuario.mfaPolitica,
      esSuperadmin: usuario.esSuperadmin,
      roles,
    }).requerido;
  }

  private emitirAcceso(usuario: Usuario, sesion: Sesion, mfaRequerido: boolean) {
    const payload: PayloadAcceso = {
      sub: usuario.id,
      sid: sesion.id,
      mfa: sesion.mfaVerificado,
      mfaReq: mfaRequerido,
      sa: usuario.esSuperadmin,
    };
    return this.jwt.signAsync(payload, { expiresIn: this.env.JWT_ACCESS_TTL_SEG });
  }

  private async registrarIntentoFallido(usuario: Usuario) {
    const intentos = usuario.intentosFallidos + 1;
    const bloquear = intentos >= MAX_INTENTOS;
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: bloquear
        ? { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + BLOQUEO_MS) }
        : { intentosFallidos: intentos },
    });
    await this.auditarFallo(usuario.id, usuario.email, bloquear);
  }

  private auditarFallo(usuarioId: string | null, email: string, bloqueo = false) {
    return this.auditoria.registrarSuelto({
      accion: 'auth.login_fallido',
      objetoTipo: 'usuario',
      objetoId: usuarioId,
      actorId: usuarioId,
      despues: { email, bloqueo },
    });
  }
}
