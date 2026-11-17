import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { RequiereCondominio, RequierePermiso } from '../autorizacion/decoradores';
import { PropietariosService } from './propietarios.service';

const tipoPersona = z.enum(['NATURAL', 'JURIDICA']);
const tipoUnidad = z.enum(['VILLA', 'LOTE']);
const tipoTitularidad = z.enum(['TITULAR', 'COTITULAR']);
const estadoTitularidad = z.enum(['PENDIENTE_VALIDAR', 'VALIDADO', 'OBSERVADO']);
const textoOpcional = (max: number) => z.string().trim().max(max).optional().nullable();
type ArchivoCargado = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const crearPropietario = z
  .object({
    tipoPersona: tipoPersona.default('NATURAL'),
    nombre: z.string().trim().min(2).max(180),
    tipoDocumento: textoOpcional(40),
    numeroDocumento: textoOpcional(80),
    telefono: textoOpcional(40),
    correo: z.union([z.email().max(254), z.literal(''), z.null()]).optional(),
    direccion: textoOpcional(300),
  })
  .strict();
const modificarPropietario = crearPropietario
  .partial()
  .extend({ activo: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Indique los cambios');

const crearUnidad = z
  .object({
    codigo: z.string().trim().min(1).max(60),
    tipo: tipoUnidad,
    areaM2: z.number().positive().optional().nullable(),
    coeficiente: z.number().min(0).max(100).optional().nullable(),
    cuotaMensual: z.number().min(0).optional().nullable(),
    matriculaInmobiliaria: textoOpcional(80),
    estadoJuridico: textoOpcional(120),
  })
  .strict();
const modificarUnidad = crearUnidad
  .partial()
  .extend({ activa: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Indique los cambios');

const crearTitularidad = z
  .object({
    propietarioId: z.uuid(),
    unidadId: z.uuid(),
    tipo: tipoTitularidad,
    desde: z.iso.date().optional().nullable(),
    fuente: textoOpcional(240),
    soporte: textoOpcional(500),
  })
  .strict();
const cerrarTitularidad = z.object({ hasta: z.iso.date() }).strict();
const revisarTitularidad = z.object({ estado: estadoTitularidad }).strict();

@Controller()
@RequiereCondominio()
export class PropietariosController {
  constructor(private readonly propietarios: PropietariosService) {}

  @Get('propietarios')
  @RequierePermiso('01', 'leer')
  listarPropietarios(@Query('buscar') buscar?: string, @Query('estado') estado?: string) {
    return this.propietarios.listarPropietarios(buscar, estado);
  }

  @Get('propietarios/:id')
  @RequierePermiso('01', 'leer')
  detallePropietario(@Param('id', ParseUUIDPipe) id: string) {
    return this.propietarios.detallePropietario(id);
  }

  @Get('propietarios/:id/auditoria')
  @RequierePermiso('01', 'leer')
  historialPropietario(@Param('id', ParseUUIDPipe) id: string) {
    return this.propietarios.historialPropietario(id);
  }

  @Get('unidades/:id')
  @RequierePermiso('01', 'leer')
  detalleUnidad(@Param('id', ParseUUIDPipe) id: string) {
    return this.propietarios.detalleUnidad(id);
  }

  @Get('unidades/:id/auditoria')
  @RequierePermiso('01', 'leer')
  historialUnidad(@Param('id', ParseUUIDPipe) id: string) {
    return this.propietarios.historialUnidad(id);
  }

  @Get('propietarios/:id/documentos')
  @RequierePermiso('01', 'leer')
  documentosPropietario(@Param('id', ParseUUIDPipe) id: string) {
    return this.propietarios.listarDocumentos(id);
  }

  @Post('propietarios/:id/documentos')
  @RequierePermiso('01', 'editar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  subirDocumento(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() archivo?: ArchivoCargado) {
    if (!archivo) throw new BadRequestException('Seleccione un documento.');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(archivo.mimetype)) {
      throw new BadRequestException('Solo se permiten documentos PDF, JPG o PNG.');
    }
    return this.propietarios.subirDocumento(id, archivo);
  }

  @Get('propietarios/:id/documentos/:documentoId')
  @RequierePermiso('01', 'leer')
  obtenerDocumento(@Param('id', ParseUUIDPipe) id: string, @Param('documentoId', ParseUUIDPipe) documentoId: string) {
    return this.propietarios.obtenerDocumento(id, documentoId);
  }

  @Post('importaciones/leer')
  @RequierePermiso('01', 'crear')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  leerArchivoImportacion(@UploadedFile() archivo?: ArchivoCargado) {
    if (!archivo) throw new BadRequestException('Seleccione un archivo Excel.');
    return this.propietarios.leerArchivoImportacion(archivo);
  }

  @Post('importaciones/previsualizar')
  @RequierePermiso('01', 'crear')
  previsualizarImportacion(@Body() body: unknown) {
    return this.propietarios.previsualizarImportacion(body);
  }

  @Get('importaciones/pendientes')
  @RequierePermiso('01', 'leer')
  listarImportacionesPendientes() {
    return this.propietarios.listarImportacionesPendientes();
  }

  @Get('importaciones/:id')
  @RequierePermiso('01', 'crear')
  detalleImportacion(@Param('id', ParseUUIDPipe) id: string) {
    return this.propietarios.detalleImportacion(id);
  }

  @Post('importaciones/aprobar')
  @RequierePermiso('01', 'aprobar')
  aprobarImportacion(@Body() body: unknown) {
    const solicitud = body as { id?: string; crearUnidadesDesconocidas?: boolean };
    return this.propietarios.aprobarImportacion(solicitud.id ?? '', solicitud.crearUnidadesDesconocidas !== false);
  }

  @Post('importaciones/:id/rechazar')
  @RequierePermiso('01', 'aprobar')
  rechazarImportacion(@Param('id', ParseUUIDPipe) id: string) {
    return this.propietarios.rechazarImportacion(id);
  }

  @Post('propietarios')
  @RequierePermiso('01', 'crear')
  crearPropietario(@Body(new ZodPipe(crearPropietario)) body: z.infer<typeof crearPropietario>) {
    return this.propietarios.crearPropietario(body);
  }

  @Patch('propietarios/:id')
  @RequierePermiso('01', 'editar')
  modificarPropietario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(modificarPropietario)) body: z.infer<typeof modificarPropietario>,
  ) {
    return this.propietarios.modificarPropietario(id, body);
  }

  @Get('unidades')
  @RequierePermiso('01', 'leer')
  listarUnidades(@Query('buscar') buscar?: string, @Query('estado') estado?: string) {
    return this.propietarios.listarUnidades(buscar, estado);
  }

  @Post('unidades')
  @RequierePermiso('01', 'crear')
  crearUnidad(@Body(new ZodPipe(crearUnidad)) body: z.infer<typeof crearUnidad>) {
    return this.propietarios.crearUnidad(body);
  }

  @Patch('unidades/:id')
  @RequierePermiso('01', 'editar')
  modificarUnidad(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(modificarUnidad)) body: z.infer<typeof modificarUnidad>,
  ) {
    return this.propietarios.modificarUnidad(id, body);
  }

  @Get('titularidades')
  @RequierePermiso('01', 'leer')
  listarTitularidades(@Query('unidadId') unidadId?: string) {
    return this.propietarios.listarTitularidades(unidadId);
  }

  @Post('titularidades')
  @RequierePermiso('01', 'crear')
  crearTitularidad(@Body(new ZodPipe(crearTitularidad)) body: z.infer<typeof crearTitularidad>) {
    return this.propietarios.crearTitularidad(body);
  }

  @Post('titularidades/:id/cerrar')
  @RequierePermiso('01', 'editar')
  cerrarTitularidad(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cerrarTitularidad)) body: z.infer<typeof cerrarTitularidad>,
  ) {
    return this.propietarios.cerrarTitularidad(id, body.hasta);
  }

  @Post('titularidades/:id/revisar')
  @RequierePermiso('01', 'aprobar')
  revisarTitularidad(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(revisarTitularidad)) body: z.infer<typeof revisarTitularidad>,
  ) {
    return this.propietarios.revisarTitularidad(id, body.estado);
  }
}
