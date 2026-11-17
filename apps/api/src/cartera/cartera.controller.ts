import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { RequiereCondominio, RequierePermiso } from '../autorizacion/decoradores';
import { ZodPipe } from '../common/zod.pipe';
import { hoyEnBogota } from '../recaudos/recaudos.reglas';
import {
  cambiarCompromiso,
  consultaCorte,
  consultaReporte,
  crearAjuste,
  crearCompromiso,
  crearGestion,
  crearObligacion,
  filtrosAjustes,
  filtrosCartera,
  filtrosCompromisos,
  filtrosGestiones,
  filtrosObligaciones,
  generarObligaciones,
  resolverAjuste,
  tipoReporte,
  type CambiarCompromiso,
  type ConsultaReporte,
  type CrearAjuste,
  type CrearCompromiso,
  type CrearGestion,
  type CrearObligacion,
  type FiltrosCartera,
  type FiltrosCompromisos,
  type FiltrosGestiones,
  type FiltrosObligaciones,
  type GenerarObligaciones,
  type ResolverAjuste,
} from './cartera.dto';
import { reporteAExcel, reporteAPdf } from './cartera.reportes';
import { CarteraService, type ArchivoCargado } from './cartera.service';

/**
 * REQ-004 · Cartera (área 02). Permisos:
 * leer = consultar · crear = gestiones y compromisos (no cambian saldos) ·
 * editar = obligaciones, solicitar ajustes y preparar importaciones ·
 * aprobar = resolver ajustes, aprobar importaciones y generar cuotas · exportar = reportes.
 */
@Controller('cartera')
@RequiereCondominio()
export class CarteraController {
  constructor(private readonly cartera: CarteraService) {}

  @Get()
  @RequierePermiso('02', 'leer')
  listar(@Query(new ZodPipe(filtrosCartera)) f: FiltrosCartera) {
    return this.cartera.listar(f);
  }

  @Get('obligaciones')
  @RequierePermiso('02', 'leer')
  obligaciones(@Query(new ZodPipe(filtrosObligaciones)) f: FiltrosObligaciones) {
    return this.cartera.listarObligaciones(f);
  }

  @Post('obligaciones')
  @RequierePermiso('02', 'editar')
  crearObligacion(@Body(new ZodPipe(crearObligacion)) d: CrearObligacion) {
    return this.cartera.crearObligacion(d);
  }

  @Post('obligaciones/generar')
  @RequierePermiso('02', 'aprobar')
  generar(@Body(new ZodPipe(generarObligaciones)) d: GenerarObligaciones) {
    return this.cartera.generarObligaciones(d);
  }

  @Get('obligaciones/:id')
  @RequierePermiso('02', 'leer')
  detalleObligacion(@Param('id', ParseUUIDPipe) id: string) {
    return this.cartera.detalleObligacion(id);
  }

  @Get('unidades/:id')
  @RequierePermiso('02', 'leer')
  estadoDeCuenta(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(consultaCorte)) q: z.infer<typeof consultaCorte>,
  ) {
    return this.cartera.estadoDeCuenta(id, q.corte);
  }

  @Get('gestiones')
  @RequierePermiso('02', 'leer')
  gestiones(@Query(new ZodPipe(filtrosGestiones)) f: FiltrosGestiones) {
    return this.cartera.listarGestiones(f);
  }

  @Post('gestiones')
  @RequierePermiso('02', 'crear')
  crearGestion(@Body(new ZodPipe(crearGestion)) d: CrearGestion) {
    return this.cartera.crearGestion(d);
  }

  @Get('compromisos')
  @RequierePermiso('02', 'leer')
  compromisos(@Query(new ZodPipe(filtrosCompromisos)) f: FiltrosCompromisos) {
    return this.cartera.listarCompromisos(f);
  }

  @Post('compromisos')
  @RequierePermiso('02', 'crear')
  crearCompromiso(@Body(new ZodPipe(crearCompromiso)) d: CrearCompromiso) {
    return this.cartera.crearCompromiso(d);
  }

  @Post('compromisos/:id/estado')
  @HttpCode(200)
  @RequierePermiso('02', 'crear')
  cambiarCompromiso(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cambiarCompromiso)) d: CambiarCompromiso,
  ) {
    return this.cartera.cambiarCompromiso(id, d);
  }

  @Get('ajustes')
  @RequierePermiso('02', 'leer')
  ajustes(@Query(new ZodPipe(filtrosAjustes)) f: z.infer<typeof filtrosAjustes>) {
    return this.cartera.listarAjustes(f.estado);
  }

  @Post('ajustes')
  @RequierePermiso('02', 'editar')
  solicitarAjuste(@Body(new ZodPipe(crearAjuste)) d: CrearAjuste) {
    return this.cartera.solicitarAjuste(d);
  }

  @Post('ajustes/:id/resolver')
  @HttpCode(200)
  @RequierePermiso('02', 'aprobar')
  resolverAjuste(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(resolverAjuste)) d: ResolverAjuste,
  ) {
    return this.cartera.resolverAjuste(id, d);
  }

  @Post('importaciones/previsualizar')
  @RequierePermiso('02', 'editar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  previsualizar(@UploadedFile() archivo?: ArchivoCargado, @Body('fechaCorte') fechaCorte?: string) {
    if (!archivo) throw new BadRequestException('Seleccione el archivo de saldos.');
    const corte = z.iso.date().safeParse(fechaCorte);
    if (!corte.success || corte.data > hoyEnBogota()) {
      throw new BadRequestException('Indique una fecha de corte válida, no futura.');
    }
    return this.cartera.previsualizarSaldos(archivo, corte.data);
  }

  @Post('importaciones/:id/aprobar')
  @HttpCode(200)
  @RequierePermiso('02', 'aprobar')
  aprobarImportacion(@Param('id', ParseUUIDPipe) id: string) {
    return this.cartera.aprobarSaldos(id);
  }

  @Post('importaciones/:id/descartar')
  @HttpCode(200)
  @RequierePermiso('02', 'editar')
  descartarImportacion(@Param('id', ParseUUIDPipe) id: string) {
    return this.cartera.descartarSaldos(id);
  }

  @Get('reportes/:tipo')
  @RequierePermiso('02', 'exportar')
  async reporte(
    @Param('tipo', new ZodPipe(tipoReporte)) tipo: z.infer<typeof tipoReporte>,
    @Query(new ZodPipe(consultaReporte)) consulta: ConsultaReporte,
    @Res() res: Response,
  ) {
    const reporte = await this.cartera.reporte(tipo, consulta);
    const pdf = consulta.formato === 'pdf';
    const contenido = pdf ? await reporteAPdf(reporte) : reporteAExcel(reporte);
    res.setHeader(
      'Content-Type',
      pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${reporte.archivo}.${pdf ? 'pdf' : 'xlsx'}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(contenido);
  }
}
