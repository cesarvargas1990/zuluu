import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { RequiereCondominio, RequierePermiso } from '../autorizacion/decoradores';
import { ZodPipe } from '../common/zod.pipe';
import { CarteraService } from './cartera.service';
import {
  crearAjuste,
  crearCompromiso,
  crearGestion,
  crearObligacion,
  filtrosCartera,
  previsualizarSaldos,
  resolverAjuste,
  type CrearAjuste,
  type CrearCompromiso,
  type CrearGestion,
  type CrearObligacion,
  type FiltrosCartera,
  type ResolverAjuste,
} from './cartera.dto';

@Controller('cartera')
@RequiereCondominio()
export class CarteraController {
  constructor(private readonly cartera: CarteraService) {}
  @Get() @RequierePermiso('02', 'leer') listar(
    @Query(new ZodPipe(filtrosCartera)) f: FiltrosCartera,
  ) {
    return this.cartera.listar(f);
  }
  @Get('exportar') @RequierePermiso('02', 'exportar') exportar(
    @Query(new ZodPipe(filtrosCartera)) f: FiltrosCartera,
  ) {
    return this.cartera.exportar(f);
  }
  @Get('exportar/excel') @RequierePermiso('02', 'exportar') async excel(
    @Query(new ZodPipe(filtrosCartera)) f: FiltrosCartera,
    @Res() res: Response,
  ) {
    const rows = await this.cartera.exportar(f);
    const data = rows.map((o) => ({
      Número: o.numero,
      Unidad: o.unidad.codigo,
      Propietario: o.propietarios.map((p) => p.nombre).join(', '),
      Periodo: o.periodo,
      Concepto: o.concepto,
      Vencimiento: o.fechaVencimiento,
      Valor: o.valor,
      Saldo: o.saldo,
      'Días mora': o.diasMora,
      Antigüedad: o.tramo,
      Estado: o.estado,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Cartera');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="cartera.xlsx"');
    res.send(buf);
  }
  @Get('exportar/pdf') @RequierePermiso('02', 'exportar') async pdf(
    @Query(new ZodPipe(filtrosCartera)) f: FiltrosCartera,
    @Res() res: Response,
  ) {
    const rows = await this.cartera.exportar(f);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
    const chunks: Buffer[] = [];
    const ready = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    doc
      .fontSize(18)
      .text('Estado de cartera', { align: 'left' })
      .moveDown(0.5)
      .fontSize(9)
      .text(`Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`)
      .moveDown();
    for (const o of rows) {
      doc
        .fontSize(8)
        .text(
          `${o.unidad.codigo} | ${o.propietarios.map((p) => p.nombre).join(', ') || 'Sin titular'} | ${o.periodo} | Vence ${o.fechaVencimiento} | Valor $${o.valor} | Saldo $${o.saldo} | ${o.diasMora} días | ${o.estado}`,
        );
      if (doc.y > 520) doc.addPage();
    }
    doc.end();
    const buf = await ready;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="cartera.pdf"');
    res.send(buf);
  }
  @Get('unidades/:id') @RequierePermiso('02', 'leer') detalle(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cartera.detalleUnidad(id);
  }
  @Post('obligaciones') @RequierePermiso('02', 'crear') obligacion(
    @Body(new ZodPipe(crearObligacion)) d: CrearObligacion,
  ) {
    return this.cartera.crearObligacion(d);
  }
  @Post('gestiones') @RequierePermiso('02', 'crear') gestion(
    @Body(new ZodPipe(crearGestion)) d: CrearGestion,
  ) {
    return this.cartera.crearGestion(d);
  }
  @Post('compromisos') @RequierePermiso('02', 'crear') compromiso(
    @Body(new ZodPipe(crearCompromiso)) d: CrearCompromiso,
  ) {
    return this.cartera.crearCompromiso(d);
  }
  @Post('importaciones/previsualizar')
  @RequierePermiso('02', 'crear')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  previsualizar(
    @UploadedFile() archivo?: { originalname: string; buffer: Buffer },
    @Body('fechaCorte') fechaCorte?: string,
  ) {
    if (!archivo || !fechaCorte)
      throw new BadRequestException('Seleccione Excel y fecha de corte.');
    const wb = XLSX.read(archivo.buffer, { type: 'buffer', cellDates: true });
    const hoja = wb.SheetNames[0];
    const sheet = hoja ? wb.Sheets[hoja] : undefined;
    if (!sheet) throw new BadRequestException('El archivo no tiene hojas.');
    const datos = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const filas = datos.map((f) => ({
      unidad: String(f.unidad ?? f.Unidad ?? '').trim(),
      periodo: String(f.periodo ?? f.Periodo ?? '').trim(),
      fechaVencimiento:
        f.fechaVencimiento instanceof Date
          ? f.fechaVencimiento.toISOString().slice(0, 10)
          : String(f.fechaVencimiento ?? f['Fecha vencimiento'] ?? '').trim(),
      valor: String(f.valor ?? f.Valor ?? ''),
      descripcion: String(f.descripcion ?? f.Descripcion ?? '').trim() || undefined,
    }));
    const d = previsualizarSaldos.safeParse({ archivo: archivo.originalname, fechaCorte, filas });
    if (!d.success)
      throw new BadRequestException(
        'Use columnas unidad, periodo, fechaVencimiento, valor y opcional descripcion; revise fechas y valores.',
      );
    return this.cartera.previsualizarSaldos(d.data);
  }
  @Post('importaciones/:id/aprobar') @RequierePermiso('02', 'aprobar') aprobarImportacion(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cartera.aprobarSaldos(id);
  }
  @Post('ajustes') @RequierePermiso('02', 'editar') ajuste(
    @Body(new ZodPipe(crearAjuste)) d: CrearAjuste,
  ) {
    return this.cartera.solicitarAjuste(d);
  }
  @Post('ajustes/:id/resolver') @RequierePermiso('02', 'aprobar') resolver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(resolverAjuste)) d: ResolverAjuste,
  ) {
    return this.cartera.resolverAjuste(id, d);
  }
}
