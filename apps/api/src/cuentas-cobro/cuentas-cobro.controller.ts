import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequiereCondominio, RequierePermiso } from '../autorizacion/decoradores';
import { ZodPipe } from '../common/zod.pipe';
import { anularCuentaCobro, crearEnvioCuentaCobro, crearPeriodoCobro } from './cuentas-cobro.dto';
import { CuentasCobroService } from './cuentas-cobro.service';

@Controller('cuentas-cobro')
@RequiereCondominio()
export class CuentasCobroController {
  constructor(private readonly cuentas: CuentasCobroService) {}

  @Get()
  @RequierePermiso('02', 'leer')
  listar() {
    return this.cuentas.listar();
  }

  @Post('periodos')
  @RequierePermiso('02', 'editar')
  crearPeriodo(
    @Body(new ZodPipe(crearPeriodoCobro)) dto: Parameters<CuentasCobroService['crearPeriodo']>[0],
  ) {
    return this.cuentas.crearPeriodo(dto);
  }

  @Post('periodos/:id/generar')
  @RequierePermiso('02', 'editar')
  generar(@Param('id', ParseUUIDPipe) id: string) {
    return this.cuentas.generar(id);
  }

  @Post('periodos/:id/generar-unidad/:unidadId')
  @RequierePermiso('02', 'editar')
  generarUnidad(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('unidadId', ParseUUIDPipe) unidadId: string,
  ) {
    return this.cuentas.generar(id, unidadId);
  }

  @Post(':id/aprobar')
  @RequierePermiso('02', 'aprobar')
  aprobar(@Param('id', ParseUUIDPipe) id: string) {
    return this.cuentas.aprobar(id);
  }

  @Post(':id/emitir')
  @RequierePermiso('02', 'aprobar')
  emitir(@Param('id', ParseUUIDPipe) id: string) {
    return this.cuentas.emitir(id);
  }

  @Get(':id/pdf')
  @RequierePermiso('02', 'leer')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const archivo = await this.cuentas.pdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${archivo.nombre}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(archivo.contenido);
  }

  @Post(':id/envios')
  @RequierePermiso('02', 'editar')
  registrarEnvio(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(crearEnvioCuentaCobro))
    dto: Parameters<CuentasCobroService['registrarEnvio']>[1],
  ) {
    return this.cuentas.registrarEnvio(id, dto);
  }

  @Post(':id/anular')
  @RequierePermiso('02', 'aprobar')
  anular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(anularCuentaCobro)) dto: Parameters<CuentasCobroService['anular']>[1],
  ) {
    return this.cuentas.anular(id, dto);
  }
}
