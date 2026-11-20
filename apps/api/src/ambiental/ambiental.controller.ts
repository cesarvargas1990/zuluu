import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { RequiereCondominio, RequierePermiso } from '../autorizacion/decoradores';
import { ZodPipe } from '../common/zod.pipe';
import { actualizarObligacion, actualizarProceso, cambiarEstadoProceso, crearActuacion, crearFinanza, crearObligacion, relacionarProceso } from './ambiental.dto';
import { AmbientalService } from './ambiental.service';

type Archivo = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const metadatosDocumento = z.object({ tipo: z.string().trim().min(2).max(80), actuacionId: z.uuid().optional() }).strict();

@Controller('ambiental')
@RequiereCondominio()
export class AmbientalController {
  constructor(private readonly ambiental: AmbientalService) {}

  @Get()
  listar(@Query('buscar') buscar?: string) { return this.ambiental.listar(buscar); }

  @Get('reportes/resumen')
  @RequierePermiso('06', 'exportar')
  async informeConsolidado(@Res() res: Response) {
    const pdf = await this.ambiental.informe();
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="informe-ambiental-consolidado.pdf"', 'Cache-Control': 'private, no-store' });
    res.send(pdf);
  }

  @Get(':expedienteId/reportes')
  @RequierePermiso('06', 'exportar')
  async informeIndividual(@Param('expedienteId', ParseUUIDPipe) id: string, @Res() res: Response) {
    const pdf = await this.ambiental.informe(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${id}-informe-ambiental.pdf"`, 'Cache-Control': 'private, no-store' });
    res.send(pdf);
  }

  @Get(':expedienteId')
  @RequierePermiso('06', 'leer')
  detalle(@Param('expedienteId', ParseUUIDPipe) id: string) { return this.ambiental.detalle(id); }

  @Patch(':expedienteId')
  @RequierePermiso('06', 'editar')
  actualizar(@Param('expedienteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(actualizarProceso)) dto: z.infer<typeof actualizarProceso>) { return this.ambiental.actualizar(id, dto); }

  @Patch(':expedienteId/estado')
  @RequierePermiso('06', 'aprobar')
  cambiarEstado(@Param('expedienteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(cambiarEstadoProceso)) dto: z.infer<typeof cambiarEstadoProceso>) { return this.ambiental.cambiarEstado(id, dto); }

  @Post(':expedienteId/actuaciones')
  @RequierePermiso('06', 'crear')
  crearActuacion(@Param('expedienteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(crearActuacion)) dto: z.infer<typeof crearActuacion>) { return this.ambiental.crearActuacion(id, dto); }

  @Post(':expedienteId/obligaciones')
  @RequierePermiso('06', 'crear')
  crearObligacion(@Param('expedienteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(crearObligacion)) dto: z.infer<typeof crearObligacion>) { return this.ambiental.crearObligacion(id, dto); }

  @Patch(':expedienteId/obligaciones/:obligacionId')
  @RequierePermiso('06', 'editar')
  actualizarObligacion(@Param('expedienteId', ParseUUIDPipe) id: string, @Param('obligacionId', ParseUUIDPipe) obligationId: string, @Body(new ZodPipe(actualizarObligacion)) dto: z.infer<typeof actualizarObligacion>) { return this.ambiental.actualizarObligacion(id, obligationId, dto); }

  @Post(':expedienteId/documentos')
  @RequierePermiso('06', 'editar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 25 * 1024 * 1024 } }))
  subirDocumento(@Param('expedienteId', ParseUUIDPipe) id: string, @UploadedFile() archivo?: Archivo, @Body() body?: unknown) {
    if (!archivo) throw new BadRequestException('Seleccione un documento.');
    const meta = metadatosDocumento.safeParse(body);
    if (!meta.success) throw new BadRequestException('Indique el tipo de documento y, opcionalmente, la actuación relacionada.');
    return this.ambiental.subirDocumento(id, archivo, meta.data.tipo, meta.data.actuacionId);
  }

  @Get(':expedienteId/documentos/:documentoId')
  @RequierePermiso('06', 'leer')
  async obtenerDocumento(@Param('expedienteId', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) docId: string, @Res() res: Response) {
    const doc = await this.ambiental.obtenerDocumento(id, docId);
    res.set({ 'Content-Type': doc.mimeType, 'Content-Disposition': `attachment; filename="${doc.nombre.replace(/["\r\n]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(doc.contenido);
  }

  @Patch(':expedienteId/documentos/:documentoId')
  @RequierePermiso('06', 'editar')
  verificarDocumento(@Param('expedienteId', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) docId: string, @Body() body: unknown) {
    const parsed = z.object({ verificacion: z.enum(['VALIDADO','OBSERVADO','ARCHIVADO']) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Indique un estado de verificación válido.');
    return this.ambiental.verificarDocumento(id, docId, parsed.data.verificacion);
  }

  @Post(':expedienteId/documentos/:documentoId/relaciones')
  @RequierePermiso('06', 'editar')
  relacionarDocumento(@Param('expedienteId', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) docId: string, @Body() body: unknown) {
    const parsed = z.object({ destinoId: z.uuid(), motivo: z.string().trim().min(2).max(500) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Indique el expediente relacionado y el motivo.');
    return this.ambiental.relacionarDocumento(id, docId, parsed.data.destinoId, parsed.data.motivo);
  }

  @Post(':expedienteId/finanzas')
  @RequierePermiso('06', 'editar')
  crearFinanza(@Param('expedienteId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = crearFinanza.safeParse(body);
    if (!dto.success) throw new BadRequestException('Revise tipo, concepto, valor y estado del registro financiero.');
    return this.ambiental.crearFinanza(id, dto.data);
  }

  @Post(':expedienteId/relaciones')
  @RequierePermiso('06', 'editar')
  relacionar(@Param('expedienteId', ParseUUIDPipe) id: string, @Body(new ZodPipe(relacionarProceso)) dto: z.infer<typeof relacionarProceso>) { return this.ambiental.relacionar(id, dto.destinoId, dto.motivo); }
}
