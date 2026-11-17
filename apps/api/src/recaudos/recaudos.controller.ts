import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { z } from 'zod';
import { RequiereCondominio, RequierePermiso } from '../autorizacion/decoradores';
import { ZodPipe } from '../common/zod.pipe';
import {
  anularRecaudo,
  confirmarImportacion,
  filtrosRecaudos,
  modificarRecaudo,
  observarRecaudo,
  previsualizarImportacion,
  registrarRecaudo,
  verificarRecaudo,
  type FiltrosRecaudos,
  type ModificarRecaudo,
  type PrevisualizarImportacion,
  type RegistrarRecaudo,
  type VerificarRecaudo,
} from './recaudos.dto';
import { RecaudosService, type ArchivoCargado } from './recaudos.service';

const DIEZ_MB = 10 * 1024 * 1024;

/** REQ-003 · Pagos y recaudos (área 02 Finanzas y cartera). */
@Controller('recaudos')
@RequiereCondominio()
export class RecaudosController {
  constructor(private readonly recaudos: RecaudosService) {}

  @Get()
  @RequierePermiso('02', 'leer')
  listar(@Query(new ZodPipe(filtrosRecaudos)) filtros: FiltrosRecaudos) {
    return this.recaudos.listar(filtros);
  }

  @Get('exportar')
  @RequierePermiso('02', 'exportar')
  exportar(@Query(new ZodPipe(filtrosRecaudos)) filtros: FiltrosRecaudos) {
    return this.recaudos.exportar(filtros);
  }

  @Post()
  @RequierePermiso('02', 'crear')
  registrar(@Body(new ZodPipe(registrarRecaudo)) body: RegistrarRecaudo) {
    return this.recaudos.registrar(body);
  }

  @Post('importaciones/leer')
  @RequierePermiso('02', 'crear')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: DIEZ_MB } }))
  leerArchivo(@UploadedFile() archivo?: ArchivoCargado) {
    if (!archivo) throw new BadRequestException('Seleccione un archivo Excel o CSV.');
    return this.recaudos.leerArchivo(archivo);
  }

  @Post('importaciones/previsualizar')
  @RequierePermiso('02', 'crear')
  previsualizar(@Body(new ZodPipe(previsualizarImportacion)) body: PrevisualizarImportacion) {
    return this.recaudos.previsualizarImportacion(body);
  }

  @Post('importaciones/:id/confirmar')
  @HttpCode(200)
  @RequierePermiso('02', 'crear')
  confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(confirmarImportacion)) body: z.infer<typeof confirmarImportacion>,
  ) {
    return this.recaudos.confirmarImportacion(id, body.incluirDuplicados === true);
  }

  @Post('importaciones/:id/descartar')
  @HttpCode(200)
  @RequierePermiso('02', 'crear')
  descartar(@Param('id', ParseUUIDPipe) id: string) {
    return this.recaudos.descartarImportacion(id);
  }

  @Get(':id')
  @RequierePermiso('02', 'leer')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.recaudos.detalle(id);
  }

  @Patch(':id')
  @RequierePermiso('02', 'editar')
  modificar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(modificarRecaudo)) body: ModificarRecaudo,
  ) {
    return this.recaudos.modificar(id, body);
  }

  @Post(':id/soportes')
  @RequierePermiso('02', 'crear')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: DIEZ_MB } }))
  subirSoporte(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() archivo?: ArchivoCargado) {
    if (!archivo) throw new BadRequestException('Seleccione el comprobante.');
    return this.recaudos.subirSoporte(id, archivo);
  }

  @Get(':id/soportes/:soporteId')
  @RequierePermiso('02', 'leer')
  obtenerSoporte(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('soporteId', ParseUUIDPipe) soporteId: string,
  ) {
    return this.recaudos.obtenerSoporte(id, soporteId);
  }

  @Post(':id/verificar')
  @HttpCode(200)
  @RequierePermiso('02', 'aprobar')
  verificar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(verificarRecaudo)) body: VerificarRecaudo,
  ) {
    return this.recaudos.verificar(id, body);
  }

  @Post(':id/observar')
  @HttpCode(200)
  @RequierePermiso('02', 'aprobar')
  observar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(observarRecaudo)) body: z.infer<typeof observarRecaudo>,
  ) {
    return this.recaudos.observar(id, body.observacion);
  }

  @Post(':id/anular')
  @HttpCode(200)
  @RequierePermiso('02', 'aprobar')
  anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(anularRecaudo)) body: z.infer<typeof anularRecaudo>,
  ) {
    return this.recaudos.anular(id, body.motivo);
  }
}
