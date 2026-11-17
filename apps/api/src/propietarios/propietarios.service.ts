import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type EstadoTitularidad, type TipoPersonaPropietaria, type TipoTitularidad, type TipoUnidadPrivada } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

type ArchivoCargado = { originalname: string; mimetype: string; size: number; buffer: Buffer };

type PropietarioInput = {
  tipoPersona?: TipoPersonaPropietaria;
  nombre?: string;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
  activo?: boolean;
};
type UnidadInput = {
  codigo?: string;
  tipo?: TipoUnidadPrivada;
  areaM2?: number | null;
  coeficiente?: number | null;
  cuotaMensual?: number | null;
  matriculaInmobiliaria?: string | null;
  estadoJuridico?: string | null;
  activa?: boolean;
};
type TitularidadInput = {
  propietarioId: string;
  unidadId: string;
  tipo: TipoTitularidad;
  desde?: string | null;
  fuente?: string | null;
  soporte?: string | null;
};

const contextoActual = () => {
  const c = contexto.actual();
  if (!c.condominioId || !c.usuarioId) throw new Error('Falta el contexto de usuario o condominio.');
  return { condominioId: c.condominioId, usuarioId: c.usuarioId };
};
const normalizar = (v?: string) => v?.trim().replace(/\s+/g, ' ');
const normalizarTipoDocumento = (v?: string | null) => {
  const tipo = v?.trim().toUpperCase() || null;
  return tipo === 'PASAPORTE' ? 'PA' : tipo;
};
const ocultarDocumento = (valor: string | null) =>
  valor ? `${'•'.repeat(Math.max(0, valor.length - 4))}${valor.slice(-4)}` : null;
const vistaAuditoriaPropietario = (p: {
  id: string;
  nombre: string;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  activo: boolean;
}) => ({
  id: p.id,
  nombre: p.nombre,
  tipoDocumento: p.tipoDocumento,
  numeroDocumento: ocultarDocumento(p.numeroDocumento),
  telefono: p.telefono ? 'registrado' : null,
  correo: p.correo ? 'registrado' : null,
  direccion: p.direccion ? 'registrada' : null,
  activo: p.activo,
});

@Injectable()
export class PropietariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listarPropietarios(buscar?: string, estado?: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, (tx) =>
      tx.propietario.findMany({
        where: {
          condominioId,
          ...(estado === 'activos' ? { activo: true } : estado === 'inactivos' ? { activo: false } : {}),
          ...(normalizar(buscar)
            ? {
                OR: [
                  { nombre: { contains: normalizar(buscar), mode: 'insensitive' } },
                  { numeroDocumento: { contains: normalizar(buscar), mode: 'insensitive' } },
                  { correo: { contains: normalizar(buscar), mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: {
          titularidades: {
            where: { hasta: null },
            include: { unidad: { select: { id: true, codigo: true, tipo: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { nombre: 'asc' },
        take: 500,
      }),
    );
  }

  async detallePropietario(id: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const propietario = await tx.propietario.findFirst({ where: { id, condominioId }, include: { titularidades: { include: { unidad: true }, orderBy: [{ hasta: 'asc' }, { createdAt: 'desc' }] } } });
      if (!propietario) throw new NotFoundException('Propietario no encontrado.');
      return propietario;
    });
  }

  async historialPropietario(id: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const existe = await tx.propietario.findFirst({ where: { id, condominioId }, select: { id: true } });
      if (!existe) throw new NotFoundException('Propietario no encontrado.');
      const eventos = await tx.auditoria.findMany({ where: { condominioId, objetoTipo: 'propietario', objetoId: id }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, accion: true, actorId: true, antes: true, despues: true, createdAt: true } });
      // El id es BigInt y JSON no lo serializa: se entrega como texto.
      return eventos.map((ev) => ({ ...ev, id: String(ev.id) }));
    });
  }

  async detalleUnidad(id: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const unidad = await tx.unidadPrivada.findFirst({ where: { id, condominioId }, include: { titularidades: { include: { propietario: { select: { id: true, nombre: true, tipoDocumento: true, numeroDocumento: true } } }, orderBy: [{ hasta: 'asc' }, { createdAt: 'desc' }] } } });
      if (!unidad) throw new NotFoundException('Unidad no encontrada.');
      return unidad;
    });
  }

  async historialUnidad(id: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const existe = await tx.unidadPrivada.findFirst({ where: { id, condominioId }, select: { id: true } });
      if (!existe) throw new NotFoundException('Unidad no encontrada.');
      const eventos = await tx.auditoria.findMany({ where: { condominioId, objetoTipo: 'unidad_privada', objetoId: id }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, accion: true, actorId: true, antes: true, despues: true, createdAt: true } });
      return eventos.map((ev) => ({ ...ev, id: String(ev.id) }));
    });
  }

  async listarDocumentos(id: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const existe = await tx.propietario.findFirst({ where: { id, condominioId }, select: { id: true } });
      if (!existe) throw new NotFoundException('Propietario no encontrado.');
      return tx.documentoPropietario.findMany({ where: { propietarioId: id, condominioId }, orderBy: { createdAt: 'desc' }, select: { id: true, nombre: true, mimeType: true, tamano: true, creadoPor: true, createdAt: true } });
    });
  }

  async subirDocumento(id: string, archivo: ArchivoCargado) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const existe = await tx.propietario.findFirst({ where: { id, condominioId }, select: { id: true } });
      if (!existe) throw new NotFoundException('Propietario no encontrado.');
      const nombre = archivo.originalname.replace(/[\\/\p{Cc}]/gu, '_').slice(0, 180);
      const doc = await tx.documentoPropietario.create({ data: { condominioId, propietarioId: id, nombre, mimeType: archivo.mimetype, tamano: archivo.size, contenido: Uint8Array.from(archivo.buffer), creadoPor: usuarioId }, select: { id: true, nombre: true, mimeType: true, tamano: true, creadoPor: true, createdAt: true } });
      await this.auditoria.registrar(tx, { accion: 'propietario.documento_cargado', objetoTipo: 'propietario', objetoId: id, condominioId, actorId: usuarioId, despues: { documentoId: doc.id, nombre: doc.nombre, mimeType: doc.mimeType, tamano: doc.tamano } });
      return doc;
    });
  }

  async obtenerDocumento(id: string, documentoId: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const doc = await tx.documentoPropietario.findFirst({ where: { id: documentoId, propietarioId: id, condominioId } });
      if (!doc) throw new NotFoundException('Documento no encontrado.');
      return { ...doc, contenido: Buffer.from(doc.contenido).toString('base64') };
    });
  }

  leerArchivoImportacion(archivo: ArchivoCargado) {
    if (!/\.(xlsx|xls|csv)$/i.test(archivo.originalname)) throw new ConflictException('Use un archivo Excel .xlsx, .xls o CSV.');
    const libro = XLSX.read(archivo.buffer, { type: 'buffer', cellDates: false });
    const nombreHoja = libro.SheetNames.at(0);
    if (!nombreHoja) throw new ConflictException('El archivo no contiene hojas con datos.');
    const hoja = libro.Sheets[nombreHoja];
    if (!hoja) throw new ConflictException('La hoja seleccionada no contiene datos legibles.');
    const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '', raw: false, blankrows: false });
    if (filas.length > 2000) throw new ConflictException('El archivo supera el máximo de 2.000 filas por revisión.');
    return { hoja: libro.SheetNames[0], columnas: Object.keys(filas[0] ?? {}), filas };
  }

  async previsualizarImportacion(entrada: unknown) {
    const body = entrada as { filas?: Record<string, unknown>[]; columnas?: Record<string, string>; archivo?: string };
    if (!Array.isArray(body.filas) || body.filas.length === 0 || body.filas.length > 2000) throw new ConflictException('No hay filas válidas para revisar.');
    const filasEntrada = body.filas;
    const columnas = body.columnas ?? {};
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const unidades = await tx.unidadPrivada.findMany({ where: { condominioId }, select: { id: true, codigo: true } });
      const propietarios = await tx.propietario.findMany({ where: { condominioId }, select: { id: true, tipoDocumento: true, numeroDocumento: true, nombre: true } });
      const porUnidad = new Set(unidades.map((u) => u.codigo.trim().toLocaleLowerCase()));
      const docs = new Set(propietarios.filter((p) => p.numeroDocumento).map((p) => `${normalizarTipoDocumento(p.tipoDocumento) ?? ''}|${p.numeroDocumento!.replace(/\s/g, '').toLocaleLowerCase()}`));
      const numerosDoc = new Set(propietarios.filter((p) => p.numeroDocumento).map((p) => p.numeroDocumento!.replace(/\s/g, '').toLocaleLowerCase()));
      const nombres = new Set(propietarios.map((p) => p.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()));
      const vistos = new Set<string>();
      const nombresVistos = new Set<string>();
      const revisadas = filasEntrada.map((fila, indice) => {
        const valor = (campo: string) => String(fila[columnas[campo] ?? campo] ?? '').trim();
        const nombre = valor('nombre'); const nombreClave = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); const unidad = valor('unidad'); const doc = valor('numeroDocumento').replace(/\s/g, ''); const tipoDoc = normalizarTipoDocumento(valor('tipoDocumento')) ?? ''; const tipoUnidadFuente = valor('tipoUnidad').toUpperCase();
        const alertas: string[] = [];
        if (!nombre) alertas.push('Falta el nombre');
        if (!unidad) alertas.push('Falta el código de unidad');
        const unidadDesconocida = !!unidad && !porUnidad.has(unidad.toLocaleLowerCase());
        if (unidadDesconocida && !['LOTE', 'VILLA'].includes(tipoUnidadFuente)) alertas.push('Código nuevo: indique tipoUnidad VILLA o LOTE para crearlo automáticamente');
        const clave = `${tipoDoc}|${doc}`;
        if (doc && ((tipoDoc ? docs.has(clave) : numerosDoc.has(doc)) || vistos.has(clave))) alertas.push('Posible propietario duplicado; requiere revisión');
        else if (nombreClave && (nombres.has(nombreClave) || nombresVistos.has(nombreClave))) alertas.push('Nombre coincidente sin identificación suficiente; requiere revisión');
        if (doc) vistos.add(clave);
        if (nombreClave) nombresVistos.add(nombreClave);
        return { fila: indice + 2, unidadDesconocida, datos: { nombre, unidad, tipoDocumento: tipoDoc, numeroDocumento: doc, telefono: valor('telefono'), correo: valor('correo'), direccion: valor('direccion'), tipoUnidad: ['LOTE', 'VILLA'].includes(tipoUnidadFuente) ? tipoUnidadFuente : '', tipoTitularidad: valor('tipoTitularidad').toUpperCase() === 'COTITULAR' ? 'COTITULAR' : 'TITULAR', fuente: valor('fuente') }, alertas };
      });
      const resumen = { total: revisadas.length, conAlertas: revisadas.filter((f) => f.alertas.length).length, sinAlertas: revisadas.filter((f) => !f.alertas.length).length };
      const preparada = await tx.importacionPropietarios.create({ data: { condominioId, creadaPor: usuarioId, archivo: body.archivo?.replace(/[\\/\p{Cc}]/gu, '_').slice(0, 180) || 'Importación Excel', filas: revisadas as unknown as Prisma.InputJsonValue, resumen }, select: { id: true, estado: true, creadaEn: true } });
      return { ...preparada, filas: revisadas, resumen };
    });
  }

  async listarImportacionesPendientes() {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, (tx) => tx.importacionPropietarios.findMany({ where: { condominioId, estado: 'PENDIENTE_REVISION' }, orderBy: { creadaEn: 'asc' }, take: 50, select: { id: true, archivo: true, resumen: true, creadaPor: true, creadaEn: true } }));
  }

  async detalleImportacion(id: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const registro = await tx.importacionPropietarios.findFirst({ where: { id, condominioId, estado: 'PENDIENTE_REVISION' } });
      if (!registro) throw new NotFoundException('Importación pendiente no encontrada.');
      return { id: registro.id, archivo: registro.archivo, estado: registro.estado, creadaPor: registro.creadaPor, creadaEn: registro.creadaEn, filas: registro.filas, resumen: registro.resumen };
    });
  }

  async aprobarImportacion(id: string, crearUnidadesDesconocidas = true) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const importacion = await tx.importacionPropietarios.findFirst({ where: { id, condominioId, estado: 'PENDIENTE_REVISION' } });
      if (!importacion) throw new NotFoundException('Importación pendiente no encontrada.');
      const filas = importacion.filas as unknown as Array<{ unidadDesconocida?: boolean; datos: Record<string, string>; alertas: string[] }>;
      const aptas = filas.filter((f) => !f.alertas?.length || (crearUnidadesDesconocidas && f.unidadDesconocida && ['VILLA', 'LOTE'].includes(f.datos.tipoUnidad ?? '') && f.alertas.every((a) => a === 'Código de unidad desconocido; requiere decisión administrativa')));
      if (!aptas.length) throw new ConflictException('No hay filas sin observaciones para aprobar.');
      const reclamada = await tx.importacionPropietarios.updateMany({ where: { id, condominioId, estado: 'PENDIENTE_REVISION' }, data: { estado: 'APROBADA', aprobadaPor: usuarioId, revisadaEn: new Date() } });
      if (reclamada.count !== 1) throw new ConflictException('La importación ya fue revisada por otro usuario.');
      const resultado = { propietarios: 0, unidades: 0, vinculaciones: 0 };
      for (const fila of aptas) {
        const d = fila.datos;
        if (!d.nombre?.trim() || !d.unidad?.trim()) throw new ConflictException('Cada fila debe tener nombre y unidad.');
        let unidad = await tx.unidadPrivada.findFirst({ where: { condominioId, codigo: { equals: d.unidad.trim(), mode: 'insensitive' } } });
        if (!unidad) {
          if (!crearUnidadesDesconocidas || !['VILLA', 'LOTE'].includes(d.tipoUnidad ?? '')) continue;
          unidad = await tx.unidadPrivada.create({ data: { condominioId, codigo: d.unidad.trim(), tipo: d.tipoUnidad as TipoUnidadPrivada } }); resultado.unidades++;
        }
        const numeroDocumento = d.numeroDocumento?.trim() || null;
        const tipoDocumento = normalizarTipoDocumento(d.tipoDocumento) ?? null;
        let propietario = numeroDocumento ? await tx.propietario.findFirst({ where: { condominioId, ...(tipoDocumento ? { tipoDocumento: { in: tipoDocumento === 'PA' ? ['PA', 'PASAPORTE'] : [tipoDocumento] } } : {}), numeroDocumento } }) : null;
        if (!propietario) {
          propietario = await tx.propietario.create({ data: { condominioId, tipoPersona: 'NATURAL', nombre: normalizar(d.nombre)!, tipoDocumento, numeroDocumento, telefono: d.telefono || null, correo: d.correo?.toLowerCase() || null, direccion: d.direccion || null } });
          resultado.propietarios++;
          await this.auditoria.registrar(tx, { accion: 'propietario.importado', objetoTipo: 'propietario', objetoId: propietario.id, condominioId, actorId: usuarioId, despues: vistaAuditoriaPropietario(propietario) });
        }
        const vigente = await tx.titularidad.findFirst({ where: { condominioId, propietarioId: propietario.id, unidadId: unidad.id, hasta: null } });
        if (!vigente) {
          const link = await tx.titularidad.create({ data: { condominioId, propietarioId: propietario.id, unidadId: unidad.id, tipo: d.tipoTitularidad === 'COTITULAR' ? 'COTITULAR' : 'TITULAR', estado: 'PENDIENTE_VALIDAR', fuente: d.fuente || 'Importación revisada' } });
          resultado.vinculaciones++;
          await this.auditoria.registrar(tx, { accion: 'titularidad.importada_pendiente_validacion', objetoTipo: 'titularidad', objetoId: link.id, condominioId, actorId: usuarioId, despues: { unidadId: unidad.id, propietarioId: propietario.id, estado: link.estado, fuente: link.fuente } });
        }
      }
      await tx.importacionPropietarios.update({ where: { id }, data: { filas: [] } });
      await this.auditoria.registrar(tx, { accion: 'propietarios.importacion_aprobada', objetoTipo: 'importacion_propietarios', objetoId: id, condominioId, actorId: usuarioId, despues: { archivo: importacion.archivo, filasIncluidas: aptas.length, ...resultado } });
      return resultado;
    });
  }

  async rechazarImportacion(id: string) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const actualizada = await tx.importacionPropietarios.updateMany({ where: { id, condominioId, estado: 'PENDIENTE_REVISION' }, data: { estado: 'RECHAZADA', aprobadaPor: usuarioId, revisadaEn: new Date(), filas: [] } });
      if (actualizada.count !== 1) throw new NotFoundException('Importación pendiente no encontrada.');
      await this.auditoria.registrar(tx, { accion: 'propietarios.importacion_rechazada', objetoTipo: 'importacion_propietarios', objetoId: id, condominioId, actorId: usuarioId });
      return { estado: 'RECHAZADA' };
    });
  }

  async crearPropietario(datos: PropietarioInput) {
    const { condominioId, usuarioId } = contextoActual();
    const numeroDocumento = datos.numeroDocumento?.trim() || null;
    const tipoDocumento = normalizarTipoDocumento(datos.tipoDocumento);
    return this.prisma.withTenant(condominioId, async (tx) => {
      if (numeroDocumento && tipoDocumento) {
        const duplicado = await tx.propietario.findFirst({
          where: {
            condominioId,
            tipoDocumento: { in: tipoDocumento === 'PA' ? ['PA', 'PASAPORTE'] : [tipoDocumento], mode: 'insensitive' },
            numeroDocumento: { equals: numeroDocumento, mode: 'insensitive' },
          },
          select: { id: true, nombre: true },
        });
        if (duplicado) {
          throw new ConflictException(
            `Ya existe un propietario con ese documento: ${duplicado.nombre}. Revise el registro antes de crear otro.`,
          );
        }
      }
      const creado = await tx.propietario.create({
        data: {
          condominioId,
          tipoPersona: datos.tipoPersona ?? 'NATURAL',
          nombre: normalizar(datos.nombre)!,
          tipoDocumento,
          numeroDocumento,
          telefono: datos.telefono?.trim() || null,
          correo: datos.correo?.trim().toLowerCase() || null,
          direccion: datos.direccion?.trim() || null,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'propietario.creado',
        objetoTipo: 'propietario',
        objetoId: creado.id,
        condominioId,
        actorId: usuarioId,
        despues: vistaAuditoriaPropietario(creado),
      });
      return creado;
    });
  }

  async modificarPropietario(id: string, datos: PropietarioInput) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const anterior = await tx.propietario.findFirst({ where: { id, condominioId } });
      if (!anterior) throw new NotFoundException('Propietario no encontrado.');
      const numeroDocumento = datos.numeroDocumento === undefined ? undefined : datos.numeroDocumento?.trim() || null;
      const tipoDocumento = datos.tipoDocumento === undefined ? undefined : normalizarTipoDocumento(datos.tipoDocumento);
      if (numeroDocumento && tipoDocumento) {
        const duplicado = await tx.propietario.findFirst({
          where: {
            condominioId,
            id: { not: id },
            tipoDocumento: { in: tipoDocumento === 'PA' ? ['PA', 'PASAPORTE'] : [tipoDocumento], mode: 'insensitive' },
            numeroDocumento: { equals: numeroDocumento, mode: 'insensitive' },
          },
          select: { id: true, nombre: true },
        });
        if (duplicado) throw new ConflictException(`Ese documento ya está registrado a nombre de ${duplicado.nombre}.`);
      }
      const actualizado = await tx.propietario.update({
        where: { id },
        data: {
          ...datos,
          ...(datos.nombre !== undefined ? { nombre: normalizar(datos.nombre) } : {}),
          ...(datos.correo !== undefined ? { correo: datos.correo?.trim().toLowerCase() || null } : {}),
          ...(datos.telefono !== undefined ? { telefono: datos.telefono?.trim() || null } : {}),
          ...(datos.direccion !== undefined ? { direccion: datos.direccion?.trim() || null } : {}),
          ...(tipoDocumento !== undefined ? { tipoDocumento } : {}),
          ...(numeroDocumento !== undefined ? { numeroDocumento } : {}),
        },
      });
      await this.auditoria.registrar(tx, {
        accion: actualizado.activo ? 'propietario.actualizado' : 'propietario.desactivado',
        objetoTipo: 'propietario',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: vistaAuditoriaPropietario(anterior),
        despues: vistaAuditoriaPropietario(actualizado),
      });
      return actualizado;
    });
  }

  async listarUnidades(buscar?: string, estado?: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, (tx) =>
      tx.unidadPrivada.findMany({
        where: {
          condominioId,
          ...(estado === 'activas' ? { activa: true } : estado === 'inactivas' ? { activa: false } : {}),
          ...(normalizar(buscar) ? { codigo: { contains: normalizar(buscar), mode: 'insensitive' } } : {}),
        },
        include: {
          titularidades: {
            where: { hasta: null },
            include: { propietario: { select: { id: true, nombre: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { codigo: 'asc' },
        take: 500,
      }),
    );
  }

  async crearUnidad(datos: UnidadInput) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const creado = await tx.unidadPrivada.create({
        data: {
          condominioId,
          codigo: normalizar(datos.codigo)!,
          tipo: datos.tipo!,
          areaM2: datos.areaM2 == null ? null : new Prisma.Decimal(datos.areaM2),
          coeficiente: datos.coeficiente == null ? null : new Prisma.Decimal(datos.coeficiente),
          cuotaMensual: datos.cuotaMensual == null ? null : new Prisma.Decimal(datos.cuotaMensual),
          matriculaInmobiliaria: datos.matriculaInmobiliaria?.trim() || null,
          estadoJuridico: datos.estadoJuridico?.trim() || null,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'unidad.creada',
        objetoTipo: 'unidad_privada',
        objetoId: creado.id,
        condominioId,
        actorId: usuarioId,
        despues: creado,
      });
      return creado;
    }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una unidad con ese código en este condominio.');
      }
      throw e;
    });
  }

  async modificarUnidad(id: string, datos: UnidadInput) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const anterior = await tx.unidadPrivada.findFirst({ where: { id, condominioId } });
      if (!anterior) throw new NotFoundException('Unidad no encontrada.');
      const actualizado = await tx.unidadPrivada.update({
        where: { id },
        data: {
          ...datos,
          ...(datos.codigo !== undefined ? { codigo: normalizar(datos.codigo) } : {}),
          ...(datos.areaM2 !== undefined ? { areaM2: datos.areaM2 == null ? null : new Prisma.Decimal(datos.areaM2) } : {}),
          ...(datos.coeficiente !== undefined ? { coeficiente: datos.coeficiente == null ? null : new Prisma.Decimal(datos.coeficiente) } : {}),
          ...(datos.cuotaMensual !== undefined ? { cuotaMensual: datos.cuotaMensual == null ? null : new Prisma.Decimal(datos.cuotaMensual) } : {}),
          ...(datos.matriculaInmobiliaria !== undefined ? { matriculaInmobiliaria: datos.matriculaInmobiliaria?.trim() || null } : {}),
          ...(datos.estadoJuridico !== undefined ? { estadoJuridico: datos.estadoJuridico?.trim() || null } : {}),
        },
      });
      await this.auditoria.registrar(tx, {
        accion: actualizado.activa ? 'unidad.actualizada' : 'unidad.desactivada',
        objetoTipo: 'unidad_privada',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: anterior,
        despues: actualizado,
      });
      return actualizado;
    }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una unidad con ese código en este condominio.');
      }
      throw e;
    });
  }

  async listarTitularidades(unidadId?: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, (tx) =>
      tx.titularidad.findMany({
        where: { condominioId, ...(unidadId ? { unidadId } : {}) },
        include: {
          propietario: { select: { id: true, nombre: true, tipoDocumento: true, numeroDocumento: true, activo: true } },
          unidad: { select: { id: true, codigo: true, tipo: true, activa: true } },
        },
        orderBy: [{ hasta: 'asc' }, { createdAt: 'desc' }],
        take: 1000,
      }),
    );
  }

  async crearTitularidad(datos: TitularidadInput) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const [propietario, unidad] = await Promise.all([
        tx.propietario.findFirst({ where: { id: datos.propietarioId, condominioId, activo: true } }),
        tx.unidadPrivada.findFirst({ where: { id: datos.unidadId, condominioId, activa: true } }),
      ]);
      if (!propietario) throw new NotFoundException('Propietario activo no encontrado.');
      if (!unidad) throw new NotFoundException('Unidad activa no encontrada.');
      const existente = await tx.titularidad.findFirst({
        where: { condominioId, unidadId: unidad.id, propietarioId: propietario.id, hasta: null },
      });
      if (existente) throw new ConflictException('Esta persona ya aparece vinculada actualmente a esa unidad.');
      const creada = await tx.titularidad.create({
        data: {
          condominioId,
          propietarioId: propietario.id,
          unidadId: unidad.id,
          tipo: datos.tipo,
          estado: 'PENDIENTE_VALIDAR',
          desde: datos.desde ? new Date(`${datos.desde}T00:00:00.000Z`) : null,
          fuente: datos.fuente?.trim() || null,
          soporte: datos.soporte?.trim() || null,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'titularidad.creada',
        objetoTipo: 'titularidad',
        objetoId: creada.id,
        condominioId,
        actorId: usuarioId,
        despues: creada,
      });
      return creada;
    });
  }

  async cerrarTitularidad(id: string, hasta: string) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const anterior = await tx.titularidad.findFirst({ where: { id, condominioId, hasta: null } });
      if (!anterior) throw new NotFoundException('Vinculación vigente no encontrada.');
      const fecha = new Date(`${hasta}T00:00:00.000Z`);
      if (anterior.desde && fecha < anterior.desde) {
        throw new ConflictException('La fecha de finalización no puede ser anterior al inicio.');
      }
      const actualizada = await tx.titularidad.update({ where: { id }, data: { hasta: fecha } });
      await this.auditoria.registrar(tx, {
        accion: 'titularidad.cerrada',
        objetoTipo: 'titularidad',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: anterior,
        despues: actualizada,
      });
      return actualizada;
    });
  }

  async revisarTitularidad(id: string, estado: EstadoTitularidad) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const anterior = await tx.titularidad.findFirst({ where: { id, condominioId } });
      if (!anterior) throw new NotFoundException('Vinculación no encontrada.');
      const actualizada = await tx.titularidad.update({ where: { id }, data: { estado } });
      await this.auditoria.registrar(tx, {
        accion: 'titularidad.revisada',
        objetoTipo: 'titularidad',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: { estado: anterior.estado },
        despues: { estado: actualizada.estado },
      });
      return actualizada;
    });
  }
}
