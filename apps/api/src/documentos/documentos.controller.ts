import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { RequiereCondominio } from '../autorizacion/decoradores';
import { ZodPipe } from '../common/zod.pipe';
import { DocumentosService } from './documentos.service';

type Archivo = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const crearExpediente = z.object({ area: z.enum(['01','02','03','04','05','06','07','08','09','10']), codigo: z.string().trim().min(2).max(40), titulo: z.string().trim().min(3).max(240), asunto: z.string().max(2000).optional(), responsable: z.string().max(180).optional(), propietario: z.string().max(180).optional(), villa: z.string().max(80).optional(), confidencial: z.boolean().optional(), fechaVencimiento: z.iso.date().optional(), vencimientoVerificado: z.boolean().optional() }).strict();
const crearDoc = z.object({ nombre: z.string().trim().min(2).max(240), categoria: z.string().trim().min(2).max(100), radicado: z.string().max(120).optional(), fechaDocumento: z.iso.date().optional() }).strict();

@Controller('documentos')
@RequiereCondominio()
export class DocumentosController {
  constructor(private readonly documentos: DocumentosService) {}

  @Get() buscar(@Query('buscar') buscar?: string, @Query('area') area?: string) { return this.documentos.buscar(buscar ?? '', area); }
  @Get('reportes/consolidado')
  async reporteConsolidado(@Res() res: Response) { const pdf = await this.documentos.reporte(); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="informe-documental-consolidado.pdf"', 'Cache-Control': 'private, no-store' }); res.send(pdf); }
  @Post('expedientes') crearExpediente(@Body(new ZodPipe(crearExpediente)) dto: z.infer<typeof crearExpediente>) { return this.documentos.crearExpediente(dto); }
  @Get('expedientes/:expedienteId') detalle(@Param('expedienteId', ParseUUIDPipe) id: string) { return this.documentos.detalle(id); }
  @Get('expedientes/:expedienteId/exportar')
  async exportar(@Param('expedienteId', ParseUUIDPipe) id: string, @Res() res: Response) {
    const archivo = await this.documentos.exportar(id);
    res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="expediente-${id}.tar.gz"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(archivo);
  }
  @Get('expedientes/:expedienteId/reporte')
  async reporteIndividual(@Param('expedienteId', ParseUUIDPipe) id: string, @Res() res: Response) { const pdf = await this.documentos.reporte(id); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="informe-${id}.pdf"`, 'Cache-Control': 'private, no-store' }); res.send(pdf); }
  @Patch('expedientes/:expedienteId') actualizarEstado(@Param('expedienteId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ estado: z.enum(['ABIERTO','EN_REVISION','CERRADO','ARCHIVADO']), fechaVencimiento: z.iso.date().nullable().optional(), vencimientoVerificado: z.boolean().optional() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Revise el estado o vencimiento.');
    return this.documentos.actualizarExpediente(id, parsed.data);
  }
  @Post('expedientes/:expedienteId/documentos')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 25 * 1024 * 1024 } }))
  subir(@Param('expedienteId', ParseUUIDPipe) id: string, @UploadedFile() archivo?: Archivo, @Body() body?: unknown) {
    if (!archivo) throw new BadRequestException('Seleccione un documento.');
    const parsed = crearDoc.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Revise nombre, categoría, radicado y fecha del documento.');
    return this.documentos.subir(id, archivo, parsed.data);
  }
  @Post('expedientes/:expedienteId/documentos/:documentoId/versiones')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 25 * 1024 * 1024 } }))
  nuevaVersion(@Param('expedienteId', ParseUUIDPipe) expedienteId: string, @Param('documentoId', ParseUUIDPipe) documentoId: string, @UploadedFile() archivo?: Archivo) {
    if (!archivo) throw new BadRequestException('Seleccione el archivo de la nueva versión.');
    return this.documentos.nuevaVersion(expedienteId, documentoId, archivo);
  }
  @Patch('expedientes/:expedienteId/documentos/:documentoId')
  actualizarDocumento(@Param('expedienteId', ParseUUIDPipe) expedienteId: string, @Param('documentoId', ParseUUIDPipe) documentoId: string, @Body() body: unknown) {
    const parsed = z.object({ estado: z.enum(['PENDIENTE_VALIDAR','VALIDADO','OBSERVADO','ARCHIVADO']) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Indique un estado de revisión válido.');
    return this.documentos.actualizarDocumento(expedienteId, documentoId, parsed.data.estado);
  }
  @Post('expedientes/:expedienteId/actuaciones')
  actuacion(@Param('expedienteId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ tipo: z.string().trim().min(2).max(80), descripcion: z.string().trim().min(2).max(2000), radicado: z.string().max(120).optional(), fechaActuacion: z.iso.date() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Revise los datos de la actuación.');
    return this.documentos.actuacion(id, parsed.data);
  }
  @Post('expedientes/:expedienteId/obligaciones')
  obligacion(@Param('expedienteId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ titulo: z.string().trim().min(2).max(240), responsable: z.string().max(180).optional(), fechaVencimiento: z.iso.date().optional(), vencimientoVerificado: z.boolean().optional() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Revise los datos de la obligación.');
    return this.documentos.obligacion(id, parsed.data);
  }
  @Patch('expedientes/:expedienteId/obligaciones/:obligacionId')
  actualizarObligacion(@Param('expedienteId', ParseUUIDPipe) expedienteId: string, @Param('obligacionId', ParseUUIDPipe) obligacionId: string, @Body() body: unknown) {
    const parsed = z.object({ estado: z.enum(['ABIERTA','EN_CURSO','CUMPLIDA','CANCELADA']) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Indique un estado de obligación válido.');
    return this.documentos.actualizarObligacion(expedienteId, obligacionId, parsed.data.estado);
  }
  @Post('expedientes/:expedienteId/compartir')
  compartir(@Param('expedienteId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ usuarioId: z.uuid(), puedeDescargar: z.boolean().default(true) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Indique el usuario y su permiso de descarga.');
    return this.documentos.compartir(id, parsed.data.usuarioId, parsed.data.puedeDescargar);
  }
  @Delete('expedientes/:expedienteId/compartir/:usuarioId')
  revocar(@Param('expedienteId', ParseUUIDPipe) expedienteId: string, @Param('usuarioId', ParseUUIDPipe) usuarioId: string) { return this.documentos.revocarCompartido(expedienteId, usuarioId); }
  @Post('documentos/:documentoId/relaciones')
  relacion(@Param('documentoId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ entidadTipo: z.enum(['PROPIETARIO','UNIDAD','RECAUDO','CUENTA_COBRO','PROCESO_AMBIENTAL','OBLIGACION_CARTERA']), entidadId: z.uuid(), motivo: z.string().max(500).optional() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Revise la entidad relacionada.');
    return this.documentos.relacion(id, parsed.data);
  }
  @Get('expedientes/:expedienteId/documentos/:documentoId/versiones/:versionId')
  async descargar(@Param('expedienteId', ParseUUIDPipe) expedienteId: string, @Param('documentoId', ParseUUIDPipe) documentoId: string, @Param('versionId', ParseUUIDPipe) versionId: string, @Res() res: Response) {
    const archivo = await this.documentos.descargar(expedienteId, documentoId, versionId);
    res.set({ 'Content-Type': archivo.mimeType, 'Content-Disposition': `attachment; filename="${archivo.nombre.replace(/["\r\n]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(archivo.contenido);
  }
}
