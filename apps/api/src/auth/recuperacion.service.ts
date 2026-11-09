import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { Mailer } from './mailer';
import { hashPassword, validarPolitica } from './password';
import { SesionesService } from './sesiones.service';
import { generarTokenOpaco, sha256 } from './tokens';

export const VIGENCIA_RECUPERACION_MS = 30 * 60_000;
const ENLACE_INVALIDO = 'El enlace es inválido o ya venció. Solicite uno nuevo.';

@Injectable()
export class RecuperacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly auditoria: AuditoriaService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Responde igual exista o no el email. También sirve para definir la primera contraseña. */
  async solicitar(emailEntrada: string, motivo: 'recuperacion' | 'bienvenida' = 'recuperacion') {
    const email = emailEntrada.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario?.activo) return;

    const token = generarTokenOpaco();
    await this.prisma.tokenRecuperacion.create({
      data: {
        usuarioId: usuario.id,
        hash: sha256(token),
        expiraEn: new Date(Date.now() + VIGENCIA_RECUPERACION_MS),
      },
    });
    const enlace = `${this.env.WEB_ORIGIN}/restablecer?token=${encodeURIComponent(token)}`;
    await this.mailer.enviar({
      para: usuario.email,
      asunto:
        motivo === 'bienvenida'
          ? 'Bienvenido a ZULU ADMIN'
          : 'Restablecer contraseña de ZULU ADMIN',
      texto:
        `Hola ${usuario.nombre}:\n\nPara definir su contraseña abra este enlace (válido 30 minutos, un solo uso):\n${enlace}\n\n` +
        'Si usted no lo solicitó, ignore este mensaje.',
    });
    await this.auditoria.registrarSuelto({
      accion: 'auth.recuperacion_solicitada',
      objetoTipo: 'usuario',
      objetoId: usuario.id,
      actorId: usuario.id,
    });
  }

  async restablecer(token: string, password: string) {
    const error = validarPolitica(password);
    if (error) throw new BadRequestException(error);

    const registro = await this.prisma.tokenRecuperacion.findUnique({
      where: { hash: sha256(token) },
    });
    if (!registro || registro.usadoEn || registro.expiraEn.getTime() <= Date.now()) {
      throw new BadRequestException(ENLACE_INVALIDO);
    }
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tokenRecuperacion.updateMany({
        where: { id: registro.id, usadoEn: null },
        data: { usadoEn: new Date() },
      });
      if (count === 0) throw new BadRequestException(ENLACE_INVALIDO);
      await tx.usuario.update({
        where: { id: registro.usuarioId },
        data: { passwordHash, intentosFallidos: 0, bloqueadoHasta: null },
      });
      await tx.sesion.updateMany({
        where: { usuarioId: registro.usuarioId, revocadaEn: null },
        data: { revocadaEn: new Date() },
      });
      await this.auditoria.registrar(tx, {
        accion: 'auth.recuperacion_completada',
        objetoTipo: 'usuario',
        objetoId: registro.usuarioId,
        actorId: registro.usuarioId,
      });
    });
  }
}
