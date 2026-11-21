import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import PDFDocument from 'pdfkit';
import { AREAS, type Accion, type AreaCodigo } from '@zulu/shared';
import { Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { contexto } from '../contexto/contexto-solicitud';
import { evaluarPermiso } from '../autorizacion/evaluar-permiso';
import { PrismaService } from '../prisma/prisma.service';

type Upload = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type NuevoExpediente = { area: AreaCodigo; codigo: string; titulo: string; asunto?: string; responsable?: string; propietario?: string; villa?: string; confidencial?: boolean; fechaVencimiento?: string; vencimientoVerificado?: boolean };
const STORAGE = resolve(process.env.DOCUMENTOS_STORAGE_PATH ?? '/var/lib/zulu/documentos');
const execFileAsync = promisify(execFile);
const ALLOWED: Record<string, string[]> = {
  '.pdf': ['application/pdf'], '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], '.doc': ['application/msword'], '.xls': ['application/vnd.ms-excel'],
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.png': ['image/png'], '.webp': ['image/webp'],
};

@Injectable()
export class DocumentosService {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}
  private get condominioId() { const id = contexto.actual().condominioId; if (!id) throw new ForbiddenException(); return id; }
  private get usuarioId() { const id = contexto.actual().usuarioId; if (!id) throw new ForbiddenException(); return id; }

  private async permiso(area: string, expedienteId: string | undefined, accion: Accion, confidencial = false) {
    const c = contexto.actual();
    if (c.accesoExcepcionalId) { if (accion !== 'leer') throw new ForbiddenException('El acceso excepcional solo permite consulta.'); return; }
    const permisos = await this.prisma.withTenant(this.condominioId, (tx) => tx.permiso.findMany({ where: { membresiaId: { in: c.membresiaIds ?? [] }, revocadoEn: null }, select: { area: true, accion: true, efecto: true, expedienteId: true } }));
    const resultado = evaluarPermiso({ roles: c.roles ?? [], permisos, area: area as AreaCodigo, accion, expedienteId });
    if (!resultado.permitido) throw new ForbiddenException('No tiene permiso para este expediente.');
    const requiereCompartido = c.roles?.includes('CONSEJO') || (confidencial && !['ADMINISTRADORA', 'ASESOR_JURIDICO'].some((rol) => c.roles?.includes(rol as never)));
    if (requiereCompartido) {
      const share = await this.prisma.withTenant(this.condominioId, (tx) => tx.accesoDocumento.findFirst({ where: { condominioId: this.condominioId, expedienteId, usuarioId: this.usuarioId } }));
      if (!share) throw new ForbiddenException('No tiene acceso a este expediente confidencial.');
    }
  }

  async buscar(texto: string, area?: string) {
    const q = texto.trim().slice(0, 120);
    const where: Prisma.ExpedienteDigitalWhereInput = { condominioId: this.condominioId };
    if (area && area in AREAS) where.area = area;
    if (q) where.OR = [
      { titulo: { contains: q, mode: 'insensitive' } }, { asunto: { contains: q, mode: 'insensitive' } },
      { codigo: { contains: q, mode: 'insensitive' } }, { propietario: { contains: q, mode: 'insensitive' } },
      { villa: { contains: q, mode: 'insensitive' } }, { responsable: { contains: q, mode: 'insensitive' } },
      { documentos: { some: { OR: [
        { nombre: { contains: q, mode: 'insensitive' } }, { categoria: { contains: q, mode: 'insensitive' } },
        { radicado: { contains: q, mode: 'insensitive' } },
        { versiones: { some: { textoBusqueda: { contains: q, mode: 'insensitive' } } } },
      ] } } },
    ];
    const expedientes = await this.prisma.withTenant(this.condominioId, (tx) => tx.expedienteDigital.findMany({
      where, orderBy: { updatedAt: 'desc' }, take: 200,
      include: { _count: { select: { documentos: true, actuaciones: true, obligaciones: true } } },
    }));
    const result = [];
    for (const e of expedientes) {
      try { await this.permiso(e.area, e.id, 'leer', e.confidencial); result.push({ ...e, areaNombre: AREAS[e.area as AreaCodigo], alerta: e.vencimientoVerificado && e.fechaVencimiento ? (e.fechaVencimiento < new Date() ? 'VENCIDO' : e.fechaVencimiento.getTime() - Date.now() < 30 * 86400000 ? 'PROXIMO' : 'AL_DIA') : 'POR_VERIFICAR' }); }
      catch { /* ACL se aplica antes de exponer la existencia o coincidencia. */ }
    }
    if (q) await this.auditoria.registrarSuelto({ accion: 'documentos.busqueda', objetoTipo: 'expediente_digital', condominioId: this.condominioId, despues: { caracteres: q.length, coincidenciasAutorizadas: result.length } });
    return result;
  }

  async crearExpediente(dto: NuevoExpediente) {
    await this.permiso(dto.area, undefined, 'crear');
    return this.prisma.withTenant(this.condominioId, async (tx) => {
      const r = await tx.expedienteDigital.create({ data: { ...dto, fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null, condominioId: this.condominioId, creadoPor: this.usuarioId } });
      await this.auditoria.registrar(tx, { accion: 'documentos.expediente.creado', objetoTipo: 'expediente_digital', objetoId: r.id, despues: { area: r.area, codigo: r.codigo } });
      return r;
    });
  }

  private async getExpediente(id: string) {
    const e = await this.prisma.withTenant(this.condominioId, (tx) => tx.expedienteDigital.findFirst({ where: { condominioId: this.condominioId, id } }));
    if (!e) throw new NotFoundException('No se encontró el expediente.');
    await this.permiso(e.area, e.id, 'leer', e.confidencial);
    return e;
  }

  async compartir(expedienteId: string, usuarioId: string, puedeDescargar: boolean) {
    await this.getExpediente(expedienteId);
    if (!contexto.actual().roles?.includes('ADMINISTRADORA')) throw new ForbiddenException('Solo la administradora puede compartir expedientes.');
    const userExists = await this.prisma.withTenant(this.condominioId, (tx) => tx.membresia.findFirst({ where: { condominioId: this.condominioId, usuarioId, activo: true } }));
    if (!userExists) throw new NotFoundException('El usuario no tiene membresía activa en esta copropiedad.');
    return this.prisma.withTenant(this.condominioId, async (tx) => {
      const r = await tx.accesoDocumento.upsert({ where: { condominioId_expedienteId_usuarioId: { condominioId: this.condominioId, expedienteId, usuarioId } }, create: { condominioId: this.condominioId, expedienteId, usuarioId, puedeDescargar, creadoPor: this.usuarioId }, update: { puedeDescargar } });
      await this.auditoria.registrar(tx, { accion: 'documentos.acceso.compartido', objetoTipo: 'acceso_documento', objetoId: r.id, despues: { expedienteId, usuarioId, puedeDescargar } }); return r;
    });
  }

  async revocarCompartido(expedienteId: string, usuarioId: string) {
    await this.getExpediente(expedienteId);
    if (!contexto.actual().roles?.includes('ADMINISTRADORA')) throw new ForbiddenException('Solo la administradora puede revocar accesos.');
    return this.prisma.withTenant(this.condominioId, async (tx) => {
      const r = await tx.accesoDocumento.delete({ where: { condominioId_expedienteId_usuarioId: { condominioId: this.condominioId, expedienteId, usuarioId } } });
      await this.auditoria.registrar(tx, { accion: 'documentos.acceso.revocado', objetoTipo: 'acceso_documento', objetoId: r.id, despues: { expedienteId, usuarioId } }); return { ok: true };
    });
  }

  async detalle(id: string) {
    await this.getExpediente(id);
    await this.auditoria.registrarSuelto({ accion: 'documentos.expediente.consultado', objetoTipo: 'expediente_digital', objetoId: id, condominioId: this.condominioId });
    const detalle = await this.prisma.withTenant(this.condominioId, (tx) => tx.expedienteDigital.findFirst({ where: { condominioId: this.condominioId, id }, include: {
      documentos: { include: { versiones: { orderBy: { numero: 'desc' }, select: { id: true, numero: true, nombreArchivo: true, mimeType: true, tamano: true, sha256: true, createdAt: true } }, relaciones: true }, orderBy: { createdAt: 'desc' } },
      actuaciones: { orderBy: { fechaActuacion: 'desc' } }, obligaciones: { orderBy: [{ fechaVencimiento: 'asc' }] }, compartidos: { where: contexto.actual().roles?.includes('ADMINISTRADORA') ? {} : { usuarioId: this.usuarioId }, select: { usuarioId: true, puedeDescargar: true } },
    } }));
    return detalle ? { ...detalle, areaNombre: AREAS[detalle.area as AreaCodigo] } : null;
  }

  async exportar(id: string): Promise<Buffer> {
    const e = await this.getExpediente(id); await this.permiso(e.area, id, 'exportar', e.confidencial);
    await this.validarDescargaConsejo(id);
    const data = await this.detalle(id);
    if (!data) throw new NotFoundException();
    const tmp = join(STORAGE, `.export-${randomUUID()}`); const archive = `${tmp}.tar.gz`;
    await mkdir(tmp, { recursive: true, mode: 0o700 });
    try {
      const indice: unknown[] = [];
      for (const doc of data.documentos) for (const v of doc.versiones) {
        const name = `${doc.id}-v${v.numero}-${basename(v.nombreArchivo).replace(/[^\p{L}\p{N}._-]/gu, '_')}`;
        const src = await this.prisma.withTenant(this.condominioId, (tx) => tx.versionDocumento.findFirst({ where: { condominioId: this.condominioId, documentoId: doc.id, id: v.id }, select: { rutaPrivada: true } }));
        if (!src) continue;
        const path = resolve(STORAGE, src.rutaPrivada); if (!path.startsWith(`${STORAGE}/`)) continue;
        const contents = await readFile(path);
        if (createHash('sha256').update(contents).digest('hex') !== v.sha256) throw new BadRequestException('Una versión no supera la validación de integridad.');
        await writeFile(join(tmp, name), contents, { mode: 0o600, flag: 'wx' });
        indice.push({ documento: doc.nombre, categoria: doc.categoria, radicado: doc.radicado, version: v.numero, nombreArchivo: name, sha256: v.sha256, tamano: v.tamano });
      }
      await writeFile(join(tmp, 'indice.json'), JSON.stringify({ expediente: { codigo: e.codigo, titulo: e.titulo, area: AREAS[e.area as AreaCodigo], estado: e.estado }, generadoEn: new Date().toISOString(), documentos: indice }, null, 2), { mode: 0o600 });
      await execFileAsync('tar', ['-czf', archive, '-C', tmp, '.'], { timeout: 120_000, maxBuffer: 1024 * 1024 });
      const contents = await readFile(archive);
      await this.auditoria.registrarSuelto({ accion: 'documentos.expediente.exportado', objetoTipo: 'expediente_digital', objetoId: id, condominioId: this.condominioId });
      return contents;
    } finally { await rm(tmp, { recursive: true, force: true }); await rm(archive, { force: true }); }
  }

  async reporte(expedienteId?: string): Promise<Buffer> {
    const pdf = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true }); const chunks: Buffer[] = [];
    const output = new Promise<Buffer>((resolve, reject) => { pdf.on('data', (chunk: Buffer) => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); });
    pdf.fontSize(18).fillColor('#163d3b').text(expedienteId ? 'Informe de expediente documental' : 'Informe documental consolidado');
    pdf.moveDown(0.4).fontSize(9).fillColor('#555').text(`Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`);
    if (expedienteId) {
      const d = await this.detalle(expedienteId);
      if (!d) throw new NotFoundException('No se encontró el expediente.');
      await this.permiso(d.area, expedienteId, 'exportar', d.confidencial);
      await this.validarDescargaConsejo(expedienteId);
      pdf.moveDown().fontSize(13).fillColor('#111').text(`${d.codigo} · ${d.titulo}`);
      pdf.fontSize(10).text(`Área: ${AREAS[d.area as AreaCodigo]} · Estado: ${d.estado} · Responsable: ${d.responsable ?? 'No asignado'}`);
      pdf.text(`Asunto: ${d.asunto ?? 'Sin descripción'} · Propietario: ${d.propietario ?? 'No indicado'} · Villa: ${d.villa ?? 'No indicada'}`);
      pdf.moveDown().fontSize(12).text(`Documentos (${d.documentos.length})`);
      for (const doc of d.documentos) pdf.fontSize(9).text(`- ${doc.nombre} · ${doc.categoria} · ${doc.estado} · ${doc.versiones.length} versión(es)${doc.radicado ? ` · Radicado ${doc.radicado}` : ''}`);
      pdf.moveDown().fontSize(12).text(`Actuaciones (${d.actuaciones.length})`);
      for (const a of d.actuaciones) pdf.fontSize(9).text(`- ${a.fechaActuacion.toISOString().slice(0,10)} · ${a.tipo} · ${a.descripcion}`);
      pdf.moveDown().fontSize(12).text(`Obligaciones (${d.obligaciones.length})`);
      for (const o of d.obligaciones) pdf.fontSize(9).text(`- ${o.titulo} · ${o.estado} · Vence: ${o.fechaVencimiento?.toISOString().slice(0,10) ?? 'Sin fecha'} · ${o.vencimientoVerificado ? 'Verificado' : 'Por verificar'}`);
    } else {
      const visibles = await this.buscar(''); const expedientes: typeof visibles = [];
      for (const e of visibles) {
        try { await this.permiso(e.area, e.id, 'exportar', e.confidencial); await this.validarDescargaConsejo(e.id); expedientes.push(e); }
        catch { /* El informe solo incorpora expedientes autorizados para exportación. */ }
      }
      pdf.moveDown().fontSize(10).text(`Expedientes visibles con sus permisos: ${expedientes.length}`);
      for (const e of expedientes) {
        pdf.moveDown(0.5).fontSize(12).fillColor('#163d3b').text(`${e.codigo} · ${e.titulo}`);
        pdf.fontSize(9).fillColor('#333').text(`${e.areaNombre} · ${e.estado} · Responsable: ${e.responsable ?? 'No asignado'} · ${e._count.documentos} documentos · ${e._count.obligaciones} obligaciones · ${e._count.actuaciones} actuaciones`);
        pdf.text(`Vencimiento: ${e.fechaVencimiento?.toISOString().slice(0,10) ?? 'Sin fecha'} · ${e.vencimientoVerificado ? 'Verificado' : 'Por verificar'}`);
      }
    }
    pdf.end();
    const buffer = await output;
    await this.auditoria.registrarSuelto({ accion: 'documentos.reporte.generado', objetoTipo: 'expediente_digital', objetoId: expedienteId ?? null, condominioId: this.condominioId });
    return buffer;
  }

  private async validarDescargaConsejo(expedienteId: string) {
    if (!contexto.actual().roles?.includes('CONSEJO')) return;
    const acceso = await this.prisma.withTenant(this.condominioId, (tx) => tx.accesoDocumento.findFirst({ where: { condominioId: this.condominioId, expedienteId, usuarioId: this.usuarioId } }));
    if (!acceso?.puedeDescargar) throw new ForbiddenException('Este expediente se compartió solo para consulta.');
  }

  async actualizarExpediente(id: string, dto: { estado: string; fechaVencimiento?: string | null; vencimientoVerificado?: boolean }) {
    const e = await this.getExpediente(id); await this.permiso(e.area, id, 'editar', e.confidencial);
    return this.prisma.withTenant(this.condominioId, async (tx) => {
      const updated = await tx.expedienteDigital.update({ where: { condominioId_id: { condominioId: this.condominioId, id } }, data: { estado: dto.estado, ...(dto.fechaVencimiento !== undefined ? { fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null } : {}), ...(dto.vencimientoVerificado !== undefined ? { vencimientoVerificado: dto.vencimientoVerificado } : {}) } });
      await this.auditoria.registrar(tx, { accion: 'documentos.expediente.actualizado', objetoTipo: 'expediente_digital', objetoId: id, despues: dto }); return updated;
    });
  }

  async subir(id: string, file: Upload, meta: { nombre: string; categoria: string; radicado?: string; fechaDocumento?: string }) {
    const e = await this.getExpediente(id); await this.permiso(e.area, id, 'crear', e.confidencial);
    const ext = basename(file.originalname).toLowerCase().slice(basename(file.originalname).lastIndexOf('.'));
    if (!ALLOWED[ext] || !ALLOWED[ext].includes(file.mimetype)) throw new BadRequestException('Formato no permitido; use PDF, Word, Excel, JPG, PNG o WEBP.');
    if (!file.size || file.size > 25 * 1024 * 1024) throw new BadRequestException('El archivo debe tener un máximo de 25 MB.');
    this.validarFirma(ext, file.buffer);
    const digest = createHash('sha256').update(file.buffer).digest('hex');
    const idDoc = randomUUID();
    const ruta = join(this.condominioId, id, `${idDoc}${ext}`);
    const destino = resolve(STORAGE, ruta);
    if (!destino.startsWith(`${STORAGE}/`)) throw new BadRequestException('Ruta de archivo inválida.');
    await mkdir(join(STORAGE, this.condominioId, id), { recursive: true, mode: 0o700 });
    await writeFile(destino, file.buffer, { mode: 0o600, flag: 'wx' });
    const textoBusqueda = await this.extraerTexto(ext, file.buffer);
    try {
      return await this.prisma.withTenant(this.condominioId, async (tx) => {
        const doc = await tx.documentoDigital.create({ data: { id: idDoc, condominioId: this.condominioId, expedienteId: id, nombre: meta.nombre, categoria: meta.categoria, radicado: meta.radicado, fechaDocumento: meta.fechaDocumento ? new Date(meta.fechaDocumento) : null, creadoPor: this.usuarioId,
        } });
        await tx.versionDocumento.create({ data: { condominioId: this.condominioId, documentoId: doc.id, numero: 1, nombreArchivo: basename(file.originalname), mimeType: file.mimetype, tamano: file.size, sha256: digest, rutaPrivada: ruta, textoBusqueda, creadoPor: this.usuarioId } });
        await this.auditoria.registrar(tx, { accion: 'documentos.archivo.cargado', objetoTipo: 'documento_digital', objetoId: doc.id, despues: { sha256: digest, tamano: file.size, version: 1 } });
        return doc;
      });
    } catch (error) { await rm(destino, { force: true }); throw error; }
  }

  private validarFirma(ext: string, buffer: Buffer) {
    const firmas: Record<string, boolean> = {
      '.pdf': buffer.subarray(0, 5).toString() === '%PDF-',
      '.png': buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      '.jpg': buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
      '.jpeg': buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
      '.webp': buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
      '.docx': buffer.subarray(0, 2).toString() === 'PK', '.xlsx': buffer.subarray(0, 2).toString() === 'PK',
      '.doc': buffer.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])),
      '.xls': buffer.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])),
    };
    if (!firmas[ext]) throw new BadRequestException('El contenido del archivo no coincide con su formato.');
  }

  private async extraerTexto(ext: string, buffer: Buffer): Promise<string | undefined> {
    try {
      if (ext === '.xlsx' || ext === '.xls') { const workbook = XLSX.read(buffer, { type: 'buffer' }); return workbook.SheetNames.map((s) => workbook.Sheets[s] ? XLSX.utils.sheet_to_csv(workbook.Sheets[s]!) : '').join('\n').slice(0, 250_000); }
      if (ext === '.docx') { const extracted = await mammoth.extractRawText({ buffer }); return extracted.value.slice(0, 250_000); }
      if (ext === '.pdf') {
        const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
        const pdf = await task.promise; const pages: string[] = [];
        for (let i = 1; i <= Math.min(pdf.numPages, 1000); i++) { const page = await pdf.getPage(i); const content = await page.getTextContent(); pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' ')); if (pages.join(' ').length >= 250_000) break; }
        await task.destroy(); return pages.join('\n').slice(0, 250_000);
      }
    } catch { return undefined; }
    return undefined;
  }

  async nuevaVersion(expedienteId: string, documentoId: string, file: Upload) {
    const doc = await this.prisma.withTenant(this.condominioId, (tx) => tx.documentoDigital.findFirst({ where: { condominioId: this.condominioId, expedienteId, id: documentoId }, include: { expediente: true } }));
    if (!doc) throw new NotFoundException('No se encontró el documento.');
    await this.permiso(doc.expediente.area, expedienteId, 'editar', doc.expediente.confidencial);
    const ext = basename(file.originalname).toLowerCase().slice(basename(file.originalname).lastIndexOf('.'));
    if (!ALLOWED[ext] || !ALLOWED[ext].includes(file.mimetype) || !file.size || file.size > 25 * 1024 * 1024) throw new BadRequestException('Archivo no permitido o superior a 25 MB.');
    this.validarFirma(ext, file.buffer);
    const existente = await this.prisma.withTenant(this.condominioId, (tx) => tx.versionDocumento.findFirst({ where: { condominioId: this.condominioId, documentoId }, orderBy: { numero: 'desc' } }));
    const numero = (existente?.numero ?? 0) + 1; const digest = createHash('sha256').update(file.buffer).digest('hex');
    const ruta = join(this.condominioId, expedienteId, `${documentoId}-v${numero}-${randomUUID()}${ext}`); const destino = resolve(STORAGE, ruta);
    await mkdir(join(STORAGE, this.condominioId, expedienteId), { recursive: true, mode: 0o700 }); await writeFile(destino, file.buffer, { mode: 0o600, flag: 'wx' });
    const textoBusqueda = await this.extraerTexto(ext, file.buffer);
    try { return await this.prisma.withTenant(this.condominioId, async (tx) => {
      const v = await tx.versionDocumento.create({ data: { condominioId: this.condominioId, documentoId, numero, nombreArchivo: basename(file.originalname), mimeType: file.mimetype, tamano: file.size, sha256: digest, rutaPrivada: ruta, textoBusqueda, creadoPor: this.usuarioId } });
      await tx.documentoDigital.update({ where: { condominioId_id: { condominioId: this.condominioId, id: documentoId } }, data: { estado: 'PENDIENTE_VALIDAR' } });
      await this.auditoria.registrar(tx, { accion: 'documentos.version.creada', objetoTipo: 'version_documento', objetoId: v.id, despues: { documentoId, numero, sha256: digest } }); return v;
    }); } catch (error) { await rm(destino, { force: true }); throw error; }
  }

  async actualizarDocumento(expedienteId: string, documentoId: string, estado: string) {
    const doc = await this.prisma.withTenant(this.condominioId, (tx) => tx.documentoDigital.findFirst({ where: { condominioId: this.condominioId, id: documentoId, expedienteId }, include: { expediente: true } }));
    if (!doc) throw new NotFoundException('No se encontró el documento.');
    await this.permiso(doc.expediente.area, expedienteId, 'editar', doc.expediente.confidencial);
    return this.prisma.withTenant(this.condominioId, async (tx) => { const updated = await tx.documentoDigital.update({ where: { condominioId_id: { condominioId: this.condominioId, id: documentoId } }, data: { estado } }); await this.auditoria.registrar(tx, { accion: 'documentos.estado.actualizado', objetoTipo: 'documento_digital', objetoId: documentoId, despues: { estado } }); return updated; });
  }

  async actuacion(id: string, dto: { tipo: string; descripcion: string; radicado?: string; fechaActuacion: string }) {
    const e = await this.getExpediente(id); await this.permiso(e.area, id, 'crear', e.confidencial);
    return this.prisma.withTenant(this.condominioId, async (tx) => { const r = await tx.actuacionDigital.create({ data: { ...dto, fechaActuacion: new Date(dto.fechaActuacion), condominioId: this.condominioId, expedienteId: id, creadoPor: this.usuarioId } }); await this.auditoria.registrar(tx, { accion: 'documentos.actuacion.creada', objetoTipo: 'actuacion_digital', objetoId: r.id }); return r; });
  }

  async obligacion(id: string, dto: { titulo: string; responsable?: string; fechaVencimiento?: string; vencimientoVerificado?: boolean }) {
    const e = await this.getExpediente(id); await this.permiso(e.area, id, 'crear', e.confidencial);
    return this.prisma.withTenant(this.condominioId, async (tx) => { const r = await tx.obligacionDigital.create({ data: { ...dto, fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null, condominioId: this.condominioId, expedienteId: id } }); await this.auditoria.registrar(tx, { accion: 'documentos.obligacion.creada', objetoTipo: 'obligacion_digital', objetoId: r.id }); return r; });
  }

  async actualizarObligacion(expedienteId: string, obligacionId: string, estado: string) {
    const e = await this.getExpediente(expedienteId); await this.permiso(e.area, e.id, 'editar', e.confidencial);
    const exists = await this.prisma.withTenant(this.condominioId, (tx) => tx.obligacionDigital.findFirst({ where: { condominioId: this.condominioId, expedienteId, id: obligacionId }, select: { id: true } }));
    if (!exists) throw new NotFoundException('No se encontró la obligación.');
    return this.prisma.withTenant(this.condominioId, async (tx) => { const r = await tx.obligacionDigital.update({ where: { id: obligacionId }, data: { estado } }); await this.auditoria.registrar(tx, { accion: 'documentos.obligacion.actualizada', objetoTipo: 'obligacion_digital', objetoId: r.id, despues: { estado } }); return r; });
  }

  async relacion(documentoId: string, dto: { entidadTipo: string; entidadId: string; motivo?: string }) {
    const doc = await this.prisma.withTenant(this.condominioId, (tx) => tx.documentoDigital.findFirst({ where: { condominioId: this.condominioId, id: documentoId }, include: { expediente: true } }));
    if (!doc) throw new NotFoundException('No se encontró el documento.');
    await this.permiso(doc.expediente.area, doc.expedienteId, 'editar', doc.expediente.confidencial);
    const target = await this.prisma.withTenant(this.condominioId, async (tx) => {
      const map = { PROPIETARIO: tx.propietario, UNIDAD: tx.unidadPrivada, RECAUDO: tx.recaudo, CUENTA_COBRO: tx.cuentaCobro, PROCESO_AMBIENTAL: tx.procesoAmbiental, OBLIGACION_CARTERA: tx.obligacion } as const;
      const delegate = map[dto.entidadTipo as keyof typeof map] as { findFirst: (arg: object) => Promise<{ id: string } | null> };
      return delegate.findFirst({ where: { condominioId: this.condominioId, id: dto.entidadId }, select: { id: true } });
    });
    if (!target) throw new NotFoundException('No se encontró el registro relacionado en esta copropiedad.');
    return this.prisma.withTenant(this.condominioId, async (tx) => { const r = await tx.relacionDocumento.create({ data: { condominioId: this.condominioId, documentoId, entidadTipo: dto.entidadTipo, entidadId: dto.entidadId, motivo: dto.motivo } }); await this.auditoria.registrar(tx, { accion: 'documentos.relacion.creada', objetoTipo: 'relacion_documento', objetoId: r.id, despues: dto }); return r; });
  }

  async descargar(expedienteId: string, documentoId: string, versionId: string) {
    const doc = await this.prisma.withTenant(this.condominioId, (tx) => tx.documentoDigital.findFirst({ where: { condominioId: this.condominioId, id: documentoId, expedienteId }, include: { expediente: true } }));
    if (!doc) throw new NotFoundException('No se encontró el documento.');
    await this.permiso(doc.expediente.area, expedienteId, 'leer', doc.expediente.confidencial);
    const v = await this.prisma.withTenant(this.condominioId, (tx) => tx.versionDocumento.findFirst({ where: { condominioId: this.condominioId, documentoId, id: versionId } }));
    if (!v) throw new NotFoundException('No se encontró la versión.');
    if (contexto.actual().roles?.includes('CONSEJO')) {
      const acceso = await this.prisma.withTenant(this.condominioId, (tx) => tx.accesoDocumento.findFirst({ where: { condominioId: this.condominioId, expedienteId, usuarioId: this.usuarioId } }));
      if (!acceso?.puedeDescargar) throw new ForbiddenException('Este expediente se compartió solo para consulta.');
    }
    const path = resolve(STORAGE, v.rutaPrivada);
    if (!path.startsWith(`${STORAGE}/`)) throw new NotFoundException();
    const contenido = await readFile(path);
    if (createHash('sha256').update(contenido).digest('hex') !== v.sha256) throw new BadRequestException('El archivo no supera la validación de integridad.');
    await this.auditoria.registrarSuelto({ accion: 'documentos.archivo.descargado', objetoTipo: 'documento_digital', objetoId: documentoId, condominioId: this.condominioId, despues: { version: v.numero, sha256: v.sha256 } });
    return { nombre: v.nombreArchivo, mimeType: v.mimeType, contenido };
  }
}
