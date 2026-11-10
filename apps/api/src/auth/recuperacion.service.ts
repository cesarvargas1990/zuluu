import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { correoInvitacion, correoRecuperacion } from './correos';
import { Mailer } from './mailer';
import { hashPassword, validarPolitica } from './password';
import { SesionesService } from './sesiones.service';
import { generarTokenOpaco, sha256 } from './tokens';

export const VIGENCIA_RECUPERACION_MS = 30 * 60_000;
/** La invitación de bienvenida dura más: la persona puede no ver el correo de inmediato. */
export const HORAS_INVITACION = 72;
const ENLACE_INVALIDO = 'El enlace es inválido o ya venció. Solicite uno nuevo.';

@Injectable()
export class RecuperacionService {
  private readonly logger = new Logger(RecuperacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly auditoria: AuditoriaService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Responde igual exista o no el email. También sirve para definir la primera contraseña.
   * Un fallo del correo se registra pero no se propaga (no debe revelar si la cuenta existe).
   * @returns true si el correo se entregó al servidor SMTP.
   */
  async solicitar(
    emailEntrada: string,
    motivo: 'recuperacion' | 'bienvenida' = 'recuperacion',
  ): Promise<boolean> {
    const email = emailEntrada.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario?.activo) return false;

    const token = generarTokenOpaco();
    await this.prisma.tokenRecuperacion.create({
      data: {
        usuarioId: usuario.id,
        hash: sha256(token),
        expiraEn: new Date(
          Date.now() +
            (motivo === 'bienvenida' ? HORAS_INVITACION * 3_600_000 : VIGENCIA_RECUPERACION_MS),
        ),
      },
    });
    const baseWeb = `${this.env.WEB_ORIGIN}${this.env.WEB_BASE_PATH}`;
    const datos = {
      nombre: usuario.nombre,
      enlace: `${baseWeb}/restablecer?token=${encodeURIComponent(token)}`,
      urlIngreso: `${baseWeb}/ingresar`,
    };
    const contenido =
      motivo === 'bienvenida'
        ? correoInvitacion({ ...datos, horas: HORAS_INVITACION })
        : correoRecuperacion({ ...datos, minutos: VIGENCIA_RECUPERACION_MS / 60_000 });
    let enviado = true;
    try {
      await this.mailer.enviar({ para: usuario.email, ...contenido });
    } catch (e) {
      // No propagar: la respuesta debe ser igual exista o no la cuenta.
      enviado = false;
      this.logger.error(
        `No se pudo enviar el correo (${motivo}) al usuario ${usuario.id}: ${String(e)}`,
      );
    }
    await this.auditoria.registrarSuelto({
      accion: 'auth.recuperacion_solicitada',
      objetoTipo: 'usuario',
      objetoId: usuario.id,
      actorId: usuario.id,
      despues: { motivo, correoEnviado: enviado },
    });
    return enviado;
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
