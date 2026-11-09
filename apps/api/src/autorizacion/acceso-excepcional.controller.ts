import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { RequestAutenticado } from '../auth/jwt.guard';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_HORAS_ACCESO = 8;

const abrir = z
  .object({
    condominioId: z.uuid(),
    justificacion: z
      .string()
      .trim()
      .min(20, 'Describa la justificación (mínimo 20 caracteres)')
      .max(1000),
    horas: z.number().int().min(1).max(MAX_HORAS_ACCESO),
  })
  .strict();
const revocar = z.object({ condominioId: z.uuid() }).strict();

/** Acceso temporal, justificado y auditado de un superadmin a datos de un condominio (solo lectura). */
@Controller('accesos-excepcionales')
export class AccesoExcepcionalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Post()
  async abrir(
    @Req() req: RequestAutenticado,
    @Body(new ZodPipe(abrir)) body: z.infer<typeof abrir>,
  ) {
    this.soloSuperadmin(req);
    return this.prisma.withTenant(body.condominioId, async (tx) => {
      const acceso = await tx.accesoExcepcional.create({
        data: {
          condominioId: body.condominioId,
          usuarioId: req.auth.sub,
          justificacion: body.justificacion,
          venceEn: new Date(Date.now() + body.horas * 3_600_000),
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'acceso_excepcional.abierto',
        objetoTipo: 'acceso_excepcional',
        objetoId: acceso.id,
        condominioId: body.condominioId,
        despues: { justificacion: acceso.justificacion, venceEn: acceso.venceEn },
      });
      return acceso;
    });
  }

  @Post(':id/revocar')
  @HttpCode(200)
  async revocar(
    @Req() req: RequestAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(revocar)) body: z.infer<typeof revocar>,
  ) {
    this.soloSuperadmin(req);
    return this.prisma.withTenant(body.condominioId, async (tx) => {
      const actual = await tx.accesoExcepcional.findFirst({ where: { id, revocadoEn: null } });
      if (!actual) throw new NotFoundException('Recurso no encontrado.');
      const despues = await tx.accesoExcepcional.update({
        where: { id },
        data: { revocadoEn: new Date() },
      });
      await this.auditoria.registrar(tx, {
        accion: 'acceso_excepcional.revocado',
        objetoTipo: 'acceso_excepcional',
        objetoId: id,
        condominioId: body.condominioId,
        despues: { revocadoEn: despues.revocadoEn },
      });
      return despues;
    });
  }

  private soloSuperadmin(req: RequestAutenticado) {
    if (!req.auth.sa)
      throw new ForbiddenException(
        'Solo el superadministrador ZULU puede gestionar accesos excepcionales.',
      );
  }
}
