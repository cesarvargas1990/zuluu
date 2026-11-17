import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

export interface ColumnaReporte {
  titulo: string;
  /** Ancho relativo. */
  ancho: number;
  dinero?: boolean;
  numero?: boolean;
}

export interface Reporte {
  titulo: string;
  subtitulo?: string;
  /** Nombre del archivo sin extensión. */
  archivo: string;
  entidad: string;
  /** Fecha de corte AAAA-MM-DD. */
  corte: string;
  columnas: ColumnaReporte[];
  filas: (string | number)[][];
  totales?: (string | number)[];
}

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const fechaLarga = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const generado = () =>
  new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'short',
  });
/** Las fechas AAAA-MM-DD se muestran como DD/MM/AAAA. */
const visible = (v: string | number) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fechaLarga(v) : v;

export function reporteAExcel(r: Reporte): Buffer {
  const encabezado = [
    [r.entidad],
    [r.titulo],
    [`Fecha de corte: ${fechaLarga(r.corte)} · Generado: ${generado()}`],
    ...(r.subtitulo ? [[r.subtitulo]] : []),
    [],
  ];
  const hoja = XLSX.utils.aoa_to_sheet([
    ...encabezado,
    r.columnas.map((c) => c.titulo),
    ...r.filas.map((f) => f.map(visible)),
    ...(r.totales ? [r.totales] : []),
  ]);
  hoja['!cols'] = r.columnas.map((c) => ({ wch: Math.round(c.ancho * 7) }));
  // Formato de moneda sin decimales en las columnas de dinero.
  const inicio = encabezado.length + 1;
  const fin = inicio + r.filas.length + (r.totales ? 1 : 0);
  r.columnas.forEach((c, col) => {
    if (!c.dinero) return;
    for (let fila = inicio; fila < fin; fila++) {
      const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: col })] as
        XLSX.CellObject | undefined;
      if (celda && celda.t === 'n') celda.z = '"$" #,##0';
    }
  });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function reporteAPdf(r: Reporte): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
  const partes: Buffer[] = [];
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  const izquierda = doc.page.margins.left;
  const ancho = doc.page.width - izquierda - doc.page.margins.right;
  const limite = doc.page.height - doc.page.margins.bottom - 24;
  const unidades = r.columnas.reduce((s, c) => s + c.ancho, 0);
  const anchos = r.columnas.map((c) => (c.ancho / unidades) * ancho);
  const VERDE = '#0b2e1a';
  const texto = (v: string | number, c: ColumnaReporte) =>
    typeof v === 'number' ? (c.dinero ? COP.format(v) : String(v)) : String(visible(v));

  const fila = (
    valores: (string | number)[],
    opciones: { negrita?: boolean; fondo?: string; color?: string } = {},
  ) => {
    doc.font(opciones.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const celdas = valores.map((v, i) => texto(v, r.columnas[i]!));
    const alto =
      Math.max(...celdas.map((t, i) => doc.heightOfString(t, { width: anchos[i]! - 8 }))) + 8;
    if (doc.y + alto > limite) {
      doc.addPage();
      encabezadoTabla();
      doc.font(opciones.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    }
    const y = doc.y;
    if (opciones.fondo) doc.rect(izquierda, y, ancho, alto).fill(opciones.fondo);
    doc.fillColor(opciones.color ?? '#142019');
    let x = izquierda;
    celdas.forEach((t, i) => {
      const c = r.columnas[i]!;
      doc.text(t, x + 4, y + 4, {
        width: anchos[i]! - 8,
        align: c.dinero || c.numero ? 'right' : 'left',
      });
      x += anchos[i]!;
    });
    doc
      .moveTo(izquierda, y + alto)
      .lineTo(izquierda + ancho, y + alto)
      .lineWidth(0.5)
      .strokeColor('#dfe5e1')
      .stroke();
    doc.y = y + alto;
  };
  function encabezadoTabla() {
    fila(
      r.columnas.map((c) => c.titulo),
      { negrita: true, fondo: VERDE, color: '#ffffff' },
    );
  }

  doc.font('Helvetica-Bold').fontSize(16).fillColor(VERDE).text(r.titulo, izquierda, doc.y);
  doc.font('Helvetica').fontSize(10).fillColor('#4f5e55').text(r.entidad);
  doc.fontSize(9).text(`Fecha de corte: ${fechaLarga(r.corte)}   ·   Generado: ${generado()}`);
  if (r.subtitulo) doc.text(r.subtitulo);
  doc.moveDown(0.8);
  encabezadoTabla();
  if (r.filas.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#4f5e55')
      .text('No hay registros para los filtros seleccionados.', izquierda, doc.y + 8);
  }
  for (const f of r.filas) fila(f);
  if (r.totales) fila(r.totales, { negrita: true, fondo: '#eef3ef' });

  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#4f5e55')
      .text(
        `ZULU ADMIN · Página ${i + 1} de ${paginas.count}`,
        izquierda,
        doc.page.height - doc.page.margins.bottom - 10,
        {
          width: ancho,
          align: 'right',
          lineBreak: false,
        },
      );
  }
  doc.end();
  return listo;
}
