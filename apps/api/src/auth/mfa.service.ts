import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { cifrar, descifrar } from './cifrado';
import { SesionesService } from './sesiones.service';
import { sha256 } from './tokens';

authenticator.options = { window: 1 };

const CODIGOS_RESPALDO = 10;
const EMISOR = 'ZULU ADMIN';

const generarCodigoRespaldo = () => randomBytes(5).toString('hex'); // 10 caracteres, 40 bits

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly auditoria: AuditoriaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async iniciarRegistro(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    if (usuario.mfaActivadoEn)
      throw new ConflictException('La verificación en dos pasos ya está activa.');
    const secreto = authenticator.generateSecret();
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { mfaSecretoCifrado: cifrar(secreto, this.env.mfaClave) },
      });
      await this.auditoria.registrar(tx, {
        accion: 'auth.mfa_registro_iniciado',
        objetoTipo: 'usuario',
        objetoId: usuarioId,
      });
    });
    return { secreto, otpauthUrl: authenticator.keyuri(usuario.email, EMISOR, secreto) };
  }

  /** Activa el TOTP con un primer código válido y devuelve los códigos de respaldo (una sola vez). */
  async confirmarRegistro(usuarioId: string, sesionId: string, codigo: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    if (usuario.mfaActivadoEn)
      throw new ConflictException('La verificación en dos pasos ya está activa.');
    if (!usuario.mfaSecretoCifrado)
      throw new BadRequestException('Primero inicie el registro de MFA.');
    if (!authenticator.check(codigo, descifrar(usuario.mfaSecretoCifrado, this.env.mfaClave))) {
      await this.auditoria.registrarSuelto({
        accion: 'auth.mfa_fallido',
        objetoTipo: 'usuario',
        objetoId: usuarioId,
      });
      throw new UnauthorizedException('Código incorrecto.');
    }
    const codigos = Array.from({ length: CODIGOS_RESPALDO }, generarCodigoRespaldo);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: usuarioId }, data: { mfaActivadoEn: new Date() } });
      await tx.codigoRespaldo.createMany({
        data: codigos.map((c) => ({ usuarioId, hash: sha256(c) })),
      });
      await tx.sesion.update({ where: { id: sesionId }, data: { mfaVerificado: true } });
      await this.auditoria.registrar(tx, {
        accion: 'auth.mfa_registrado',
        objetoTipo: 'usuario',
        objetoId: usuarioId,
      });
    });
    return codigos;
  }

  /** Verifica TOTP (6 dígitos) o un código de respaldo de un solo uso y eleva la sesión. */
  async verificar(usuarioId: string, sesionId: string, codigo: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    if (!usuario.mfaActivadoEn || !usuario.mfaSecretoCifrado) {
      throw new BadRequestException('Debe registrar la verificación en dos pasos.');
    }
    const esTotp = /^\d{6}$/.test(codigo);
    const accion = esTotp ? 'auth.mfa_verificado' : 'auth.mfa_codigo_respaldo_usado';
    const valido = esTotp
      ? authenticator.check(codigo, descifrar(usuario.mfaSecretoCifrado, this.env.mfaClave))
      : await this.usarCodigoRespaldo(usuarioId, codigo);
    if (!valido) {
      await this.auditoria.registrarSuelto({
        accion: 'auth.mfa_fallido',
        objetoTipo: 'usuario',
        objetoId: usuarioId,
      });
      throw new UnauthorizedException('Código incorrecto.');
    }
    await this.sesiones.marcarMfaVerificado(sesionId);
    await this.auditoria.registrarSuelto({ accion, objetoTipo: 'usuario', objetoId: usuarioId });
  }

  private async usarCodigoRespaldo(usuarioId: string, codigo: string) {
    const { count } = await this.prisma.codigoRespaldo.updateMany({
      where: { usuarioId, hash: sha256(codigo.trim().toLowerCase()), usadoEn: null },
      data: { usadoEn: new Date() },
    });
    return count === 1;
  }
}
