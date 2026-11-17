import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Nav from 'react-bootstrap/Nav';
import Table from 'react-bootstrap/Table';
import { ErrorApi } from '@/api/cliente';
import {
  propietariosApi,
  type EstadoTitularidad,
  type Propietario,
  type TipoPersonaPropietaria,
  type TipoTitularidad,
  type TipoUnidadPrivada,
  type UnidadPrivada,
  type FilaImportacion,
} from '@/api/propietarios';
import { EstadoVacio } from '@/componentes/dashboard/EstadoVacio';
import { KpiCard } from '@/componentes/dashboard/KpiCard';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { Alerta, Boton, Etiqueta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { useSesion } from '@/sesion/SesionProvider';

type Vista = 'propietarios' | 'unidades' | 'titularidades';
type VistaImportacion = { id: string; estado: string; creadaEn: string; filas: FilaImportacion[]; resumen: { total: number; conAlertas: number; sinAlertas: number } };
const alertaUnidadDesconocida = 'Código de unidad desconocido; requiere decisión administrativa';
function unidadNuevaCreable(fila: FilaImportacion) {
  const soloAlertaDeUnidad = fila.alertas.length === 0 || (fila.alertas.length === 1 && fila.alertas[0] === alertaUnidadDesconocida);
  return fila.unidadDesconocida === true && ['VILLA', 'LOTE'].includes(fila.datos.tipoUnidad ?? '') && soloAlertaDeUnidad;
}
function filaAprobable(fila: FilaImportacion, crearUnidades: boolean) {
  return (fila.alertas.length === 0 && !fila.unidadDesconocida) || (crearUnidades && unidadNuevaCreable(fila));
}
type FormularioPropietario = {
  id?: string;
  tipoPersona: TipoPersonaPropietaria;
  nombre: string;
  tipoDocumento: string;
  numeroDocumento: string;
  telefono: string;
  correo: string;
  direccion: string;
  activo: boolean;
};
type FormularioUnidad = {
  id?: string;
  codigo: string;
  tipo: TipoUnidadPrivada;
  areaM2: string;
  coeficiente: string;
  cuotaMensual: string;
  matriculaInmobiliaria: string;
  estadoJuridico: string;
  activa: boolean;
};
type FormularioTitularidad = {
  propietarioId: string;
  unidadId: string;
  tipo: TipoTitularidad;
  desde: string;
  fuente: string;
  soporte: string;
};

const mensajeDe = (e: unknown) =>
  e instanceof ErrorApi ? e.message : e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
const personaVacia = (): FormularioPropietario => ({
  tipoPersona: 'NATURAL',
  nombre: '',
  tipoDocumento: '',
  numeroDocumento: '',
  telefono: '',
  correo: '',
  direccion: '',
  activo: true,
});
const unidadVacia = (): FormularioUnidad => ({
  codigo: '',
  tipo: 'VILLA',
  areaM2: '',
  coeficiente: '',
  cuotaMensual: '',
  matriculaInmobiliaria: '',
  estadoJuridico: '',
  activa: true,
});
const fechaHoy = () => new Date().toISOString().slice(0, 10);
const dinero = (valor: string | null) =>
  valor == null
    ? 'Pendiente'
    : Number(valor).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fecha = (valor: string | null) => (valor ? new Date(`${valor.slice(0, 10)}T00:00:00`).toLocaleDateString('es-CO') : 'Sin fecha');
const nombreTipoUnidad = (tipo: TipoUnidadPrivada) => (tipo === 'VILLA' ? 'Villa' : 'Lote');
const TIPOS_DOCUMENTO = [
  ['CC', 'Cédula de ciudadanía'],
  ['CE', 'Cédula de extranjería'],
  ['NIT', 'NIT'],
  ['PA', 'Pasaporte'],
  ['PPT', 'Permiso por protección temporal (PPT)'],
  ['PEP', 'Permiso especial de permanencia (PEP)'],
  ['OTRO', 'Otro'],
] as const;
const nombreEstadoTitularidad = (estado: EstadoTitularidad) =>
  ({ PENDIENTE_VALIDAR: 'Pendiente de validar', VALIDADO: 'Validado', OBSERVADO: 'Observado' })[estado];

export function Propietarios() {
  useTitulo('Propietarios y unidades');
  const { condominioActivo } = useSesion();
  const consulta = useQueryClient();
  const rol = condominioActivo?.rol;
  const puedeEditar = rol === 'ADMINISTRADORA' || rol === 'ASISTENTE';
  const puedeAprobar = rol === 'ADMINISTRADORA';
  const [vista, setVista] = useState<Vista>('propietarios');
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('todos');
  const [propietarioForm, setPropietarioForm] = useState<FormularioPropietario | null>(null);
  const [unidadForm, setUnidadForm] = useState<FormularioUnidad | null>(null);
  const [titularidadForm, setTitularidadForm] = useState<FormularioTitularidad | null>(null);
  const [cerrarId, setCerrarId] = useState<string | null>(null);
  const [fechaFin, setFechaFin] = useState(fechaHoy());
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'aviso' | 'error'; texto: string } | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [unidadDetalleId, setUnidadDetalleId] = useState<string | null>(null);
  const [pestanaDetalle, setPestanaDetalle] = useState<'general' | 'historial' | 'documentos'>('general');
  const [importar, setImportar] = useState<{ archivo: string; columnas: string[]; filas: Array<Record<string, string>>; mapeo: Record<string, string>; crearUnidades: boolean; vista?: VistaImportacion } | null>(null);
  const archivoImportacion = useRef<HTMLInputElement>(null);

  const claveBase = ['req002', condominioActivo?.condominioId];
  const personasQuery = useQuery({
    queryKey: [...claveBase, 'propietarios', buscar, estado],
    queryFn: () => propietariosApi.listarPropietarios(buscar, estado),
  });
  const unidadesQuery = useQuery({
    queryKey: [...claveBase, 'unidades', buscar, estado],
    queryFn: () => propietariosApi.listarUnidades(buscar, estado === 'todos' ? 'todas' : estado),
  });
  const titularidadesQuery = useQuery({
    queryKey: [...claveBase, 'titularidades'],
    queryFn: () => propietariosApi.listarTitularidades(),
  });
  const detalleQuery = useQuery({ queryKey: [...claveBase, 'detalle', detalleId], queryFn: () => propietariosApi.detallePropietario(detalleId!), enabled: !!detalleId });
  const historialQuery = useQuery({ queryKey: [...claveBase, 'historial', detalleId], queryFn: () => propietariosApi.historialPropietario(detalleId!), enabled: !!detalleId && pestanaDetalle === 'historial' });
  const documentosQuery = useQuery({ queryKey: [...claveBase, 'documentos', detalleId], queryFn: () => propietariosApi.listarDocumentos(detalleId!), enabled: !!detalleId && pestanaDetalle === 'documentos' });
  const unidadDetalleQuery = useQuery({ queryKey: [...claveBase, 'unidad-detalle', unidadDetalleId], queryFn: () => propietariosApi.detalleUnidad(unidadDetalleId!), enabled: !!unidadDetalleId });
  const unidadHistorialQuery = useQuery({ queryKey: [...claveBase, 'unidad-historial', unidadDetalleId], queryFn: () => propietariosApi.historialUnidad(unidadDetalleId!), enabled: !!unidadDetalleId });
  const importacionesQuery = useQuery({ queryKey: [...claveBase, 'importaciones-pendientes'], queryFn: () => propietariosApi.listarImportacionesPendientes() });
  const personas = personasQuery.data ?? [];
  const unidades = unidadesQuery.data ?? [];
  const titularidades = titularidadesQuery.data ?? [];
  const errorConsulta = personasQuery.error ?? unidadesQuery.error ?? titularidadesQuery.error;

  const recargar = () => consulta.invalidateQueries({ queryKey: claveBase });
  const mutacion = useMutation({
    mutationFn: async (accion: () => Promise<unknown>) => accion(),
    onSuccess: () => {
      setAviso({ tono: 'ok', texto: 'Los cambios se guardaron.' });
      void recargar();
    },
    onError: (error) => setAviso({ tono: 'error', texto: mensajeDe(error) }),
  });

  const unidadesActivas = useMemo(() => unidades.filter((u) => u.activa), [unidades]);
  const personasActivas = useMemo(() => personas.filter((p) => p.activo), [personas]);

  async function guardarPropietario(e: FormEvent) {
    e.preventDefault();
    if (!propietarioForm) return;
    setAviso(null);
    const { id, activo, ...datos } = propietarioForm;
    await mutacion.mutateAsync(() =>
      id
        ? propietariosApi.modificarPropietario(id, { ...datos, activo })
        : propietariosApi.crearPropietario(datos),
    );
    setPropietarioForm(null);
  }

  async function guardarUnidad(e: FormEvent) {
    e.preventDefault();
    if (!unidadForm) return;
    setAviso(null);
    const { id, activa, ...datos } = unidadForm;
    const cuerpo = {
      ...datos,
      areaM2: datos.areaM2 ? Number(datos.areaM2) : null,
      coeficiente: datos.coeficiente ? Number(datos.coeficiente) : null,
      cuotaMensual: datos.cuotaMensual ? Number(datos.cuotaMensual) : null,
    };
    await mutacion.mutateAsync(() =>
      id
        ? propietariosApi.modificarUnidad(id, { ...cuerpo, activa })
        : propietariosApi.crearUnidad(cuerpo),
    );
    setUnidadForm(null);
  }

  async function guardarTitularidad(e: FormEvent) {
    e.preventDefault();
    if (!titularidadForm) return;
    setAviso(null);
    const datos = {
      ...titularidadForm,
      desde: titularidadForm.desde || null,
      fuente: titularidadForm.fuente.trim() || null,
      soporte: titularidadForm.soporte.trim() || null,
    };
    await mutacion.mutateAsync(() => propietariosApi.crearTitularidad(datos));
    setTitularidadForm(null);
  }

  async function terminarTitularidad() {
    if (!cerrarId || !fechaFin) return;
    setAviso(null);
    await mutacion.mutateAsync(() => propietariosApi.cerrarTitularidad(cerrarId, fechaFin));
    setCerrarId(null);
  }

  return (
    <>
      <PageHeader
        titulo="Propietarios y unidades"
        descripcion={`Registro y consulta de personas, inmuebles y titularidades de ${condominioActivo?.razonSocial ?? 'la copropiedad'}.`}
        acciones={<div className="d-flex gap-2"><input ref={archivoImportacion} type="file" accept=".xlsx,.xls,.csv" className="d-none" onChange={(e) => {
          const file = e.target.files?.[0]; if (!file) return;
          void propietariosApi.leerExcel(file).then((libro) => {
            const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const mapa: Record<string, string> = {};
            for (const [campo, aliases] of Object.entries({ nombre: ['nombre', 'propietario', 'razon social'], unidad: ['unidad', 'codigo', 'codigo unidad', 'codigo de unidad', 'codigo de la unidad', 'villa', 'lote'], tipoDocumento: ['tipo documento', 'tipo de documento'], numeroDocumento: ['numero documento', 'documento', 'identificacion'], telefono: ['telefono', 'celular'], correo: ['correo', 'email'], direccion: ['direccion'], tipoUnidad: ['tipo unidad', 'tipo'], tipoTitularidad: ['titularidad', 'relacion'], fuente: ['fuente', 'origen'] })) {
              const encontrado = libro.columnas.find((c) => aliases.includes(norm(c))); if (encontrado) mapa[campo] = encontrado;
            }
            setImportar({ archivo: file.name, columnas: libro.columnas, filas: libro.filas, mapeo: mapa, crearUnidades: false });
          }).catch((error: unknown) => setAviso({ tono: 'error', texto: mensajeDe(error) }));
          e.currentTarget.value = '';
        }} />{puedeEditar && <><a className="btn btn-outline-primary" href={`${import.meta.env.BASE_URL}plantilla-importacion-propietarios.xlsx`} download><i className="bi bi-download" aria-hidden="true" /> Plantilla demo</a><Boton variante="secundario" onClick={() => archivoImportacion.current?.click()}><i className="bi bi-file-earmark-spreadsheet" aria-hidden="true" /> Importar Excel</Boton></>}<Boton variante="secundario" onClick={() => void recargar()}><i className="bi bi-arrow-clockwise" aria-hidden="true" /> Actualizar</Boton></div>}
      />
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <Nav variant="pills" activeKey={vista} onSelect={(key) => key && setVista(key as Vista)} aria-label="Secciones de propietarios">
          <Nav.Item><Nav.Link eventKey="propietarios">Propietarios</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="unidades">Unidades</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="titularidades">Vinculaciones</Nav.Link></Nav.Item>
        </Nav>
        {((vista === 'propietarios' || vista === 'unidades') && puedeEditar) || (vista === 'titularidades' && puedeEditar) ? (
          <Boton
            onClick={() => {
              setAviso(null);
              if (vista === 'propietarios') setPropietarioForm(personaVacia());
              else if (vista === 'unidades') setUnidadForm(unidadVacia());
              else setTitularidadForm({ propietarioId: '', unidadId: '', tipo: 'TITULAR', desde: '', fuente: '', soporte: '' });
            }}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
            {vista === 'propietarios' ? 'Nuevo propietario' : vista === 'unidades' ? 'Nueva unidad' : 'Vincular propietario'}
          </Boton>
        ) : null}
      </div>

      {aviso && <Alerta tono={aviso.tono} className="mb-3">{aviso.texto}</Alerta>}
      {errorConsulta && <Alerta tono="error" className="mb-3">{mensajeDe(errorConsulta)}</Alerta>}

      <div className="row row-cols-1 row-cols-sm-2 row-cols-xl-4 g-3 mb-3">
        <div className="col"><KpiCard etiqueta="Propietarios activos" valor={personasActivas.length} icono="bi-people" detalle={`${personas.length} registros en la consulta`} /></div>
        <div className="col"><KpiCard etiqueta="Unidades activas" valor={unidadesActivas.length} icono="bi-houses" detalle={`${unidades.length} unidades en la consulta`} /></div>
        <div className="col"><KpiCard etiqueta="Vinculaciones vigentes" valor={titularidades.filter((t) => !t.hasta).length} icono="bi-link-45deg" detalle="Titulares y cotitulares" /></div>
        <div className="col"><KpiCard etiqueta="Pendientes de validar" valor={titularidades.filter((t) => t.estado === 'PENDIENTE_VALIDAR').length} icono="bi-clipboard-check" detalle="Requieren revisión de administradora" /></div>
      </div>

      {!!importacionesQuery.data?.length && <Card className="mb-3"><Card.Header className="fw-semibold"><i className="bi bi-inbox me-2 text-primary" aria-hidden="true" />Importaciones pendientes de aprobación ({importacionesQuery.data.length})</Card.Header><Table responsive className="align-middle mb-0"><thead><tr><th>Archivo</th><th>Preparada</th><th>Revisión</th><th className="text-end">Acciones</th></tr></thead><tbody>{importacionesQuery.data.map((imp) => <tr key={imp.id}><td>{imp.archivo}<small className="d-block text-body-secondary">{imp.resumen.sinAlertas} filas listas · {imp.resumen.conAlertas} con observaciones</small></td><td>{new Date(imp.creadaEn).toLocaleString('es-CO')}</td><td>{imp.creadaPor}</td><td className="text-end">{puedeEditar && <Button size="sm" variant="outline-primary" onClick={() => void propietariosApi.detalleImportacion(imp.id).then((data) => setImportar({ archivo: data.archivo, columnas: [], filas: [], mapeo: {}, crearUnidades: data.filas.some(unidadNuevaCreable), vista: data })).catch((error: unknown) => setAviso({ tono: 'error', texto: mensajeDe(error) }))}>Revisar</Button>}</td></tr>)}</tbody></Table></Card>}

      {(vista === 'propietarios' || vista === 'unidades') && (
        <Card className="mb-3">
          <Card.Body className="d-flex flex-wrap align-items-end gap-3">
            <Form.Group controlId="buscar-registros" className="flex-grow-1" style={{ minWidth: '16rem' }}>
              <Form.Label>Buscar</Form.Label>
              <Form.Control value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={vista === 'propietarios' ? 'Nombre, documento o correo' : 'Código de unidad'} />
            </Form.Group>
            <Form.Group controlId="estado-registros" style={{ minWidth: '11rem' }}>
              <Form.Label>Estado</Form.Label>
              <Form.Select value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="todos">Todos</option>
                <option value={vista === 'propietarios' ? 'activos' : 'activas'}>Activos</option>
                <option value={vista === 'propietarios' ? 'inactivos' : 'inactivas'}>Inactivos</option>
              </Form.Select>
            </Form.Group>
          </Card.Body>
        </Card>
      )}

      {vista === 'propietarios' && (
        <TablaPropietarios
          datos={personas}
          cargando={personasQuery.isPending}
          puedeEditar={puedeEditar}
          alDetalle={(p) => { setDetalleId(p.id); setPestanaDetalle('general'); }}
          alEditar={(p) => setPropietarioForm({
            id: p.id,
            tipoPersona: p.tipoPersona,
            nombre: p.nombre,
            tipoDocumento: p.tipoDocumento ?? '',
            numeroDocumento: p.numeroDocumento ?? '',
            telefono: p.telefono ?? '',
            correo: p.correo ?? '',
            direccion: p.direccion ?? '',
            activo: p.activo,
          })}
        />
      )}

      <Modal show={!!detalleId} onHide={() => setDetalleId(null)} centered size="lg">
        <Modal.Header closeButton><Modal.Title>{detalleQuery.data?.nombre ?? 'Ficha de propietario'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Nav variant="tabs" activeKey={pestanaDetalle} onSelect={(key) => key && setPestanaDetalle(key as typeof pestanaDetalle)} className="mb-3"><Nav.Item><Nav.Link eventKey="general">General y unidades</Nav.Link></Nav.Item><Nav.Item><Nav.Link eventKey="documentos">Documentos</Nav.Link></Nav.Item><Nav.Item><Nav.Link eventKey="historial">Historial</Nav.Link></Nav.Item></Nav>
          {pestanaDetalle === 'general' && (detalleQuery.isPending ? <p>Cargando ficha…</p> : detalleQuery.data ? <><dl className="row mb-3"><dt className="col-sm-4">Identificación</dt><dd className="col-sm-8">{detalleQuery.data.tipoDocumento || 'Pendiente'} {detalleQuery.data.numeroDocumento || ''}</dd><dt className="col-sm-4">Teléfono</dt><dd className="col-sm-8">{detalleQuery.data.telefono || 'Información pendiente de completar.'}</dd><dt className="col-sm-4">Correo</dt><dd className="col-sm-8">{detalleQuery.data.correo || 'Información pendiente de completar.'}</dd><dt className="col-sm-4">Dirección</dt><dd className="col-sm-8">{detalleQuery.data.direccion || 'Información pendiente de completar.'}</dd></dl><h6>Unidades y titularidades</h6>{detalleQuery.data.titularidades.map((t) => <div className="border-bottom py-2" key={t.id}>{t.unidad.tipo === 'VILLA' ? 'Villa' : 'Lote'} · {t.unidad.codigo} · {t.tipo === 'COTITULAR' ? 'Cotitular' : 'Titular'} · {t.hasta ? `Finalizó ${fecha(t.hasta)}` : 'Vigente'} · {nombreEstadoTitularidad(t.estado)}</div>)}</> : <Alerta tono="error">No se pudo cargar la ficha.</Alerta>)}
          {pestanaDetalle === 'documentos' && <><div className="d-flex justify-content-between align-items-center mb-3"><span className="small text-body-secondary">PDF, JPG o PNG · máximo 10 MB</span><label className="btn btn-outline-primary btn-sm mb-0">Cargar documento<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="d-none" onChange={(e) => { const file = e.target.files?.[0]; if (file && detalleId) void propietariosApi.subirDocumento(detalleId, file).then(() => consulta.invalidateQueries({ queryKey: [...claveBase, 'documentos', detalleId] })).catch((error: unknown) => setAviso({ tono: 'error', texto: mensajeDe(error) })); e.currentTarget.value = ''; }} /></label></div>{documentosQuery.isPending ? <p>Cargando documentos…</p> : documentosQuery.data?.length ? documentosQuery.data.map((d) => <div className="d-flex justify-content-between align-items-center border-bottom py-2" key={d.id}><span><i className="bi bi-file-earmark-text me-2 text-primary" aria-hidden="true" />{d.nombre}<small className="d-block text-body-secondary">{Math.ceil(d.tamano / 1024)} KB · {fecha(d.createdAt)}</small></span><Button size="sm" variant="outline-secondary" onClick={() => void propietariosApi.obtenerDocumento(detalleId!, d.id).then((archivo) => { const raw = atob(archivo.contenido); const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: archivo.mimeType })); const a = document.createElement('a'); a.href = url; a.download = archivo.nombre; a.click(); URL.revokeObjectURL(url); }).catch((error: unknown) => setAviso({ tono: 'error', texto: mensajeDe(error) }))}>Descargar</Button></div>) : <p className="text-body-secondary">No hay documentos cargados.</p>}</>}
          {pestanaDetalle === 'historial' && (historialQuery.isPending ? <p>Cargando historial…</p> : historialQuery.data?.length ? <div className="table-responsive"><Table size="sm" hover><thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Antes / después</th></tr></thead><tbody>{historialQuery.data.map((h) => <tr key={String(h.id)}><td>{new Date(h.createdAt).toLocaleString('es-CO')}</td><td>{h.accion}</td><td>{h.actorId || 'Sistema'}</td><td><details><summary>Ver cambios</summary><pre className="small text-wrap">{JSON.stringify({ antes: h.antes, despues: h.despues }, null, 2)}</pre></details></td></tr>)}</tbody></Table></div> : <p className="text-body-secondary">Aún no hay eventos de auditoría para este propietario.</p>)}
        </Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setDetalleId(null)}>Cerrar</Button></Modal.Footer>
      </Modal>

      <Modal show={!!unidadDetalleId} onHide={() => setUnidadDetalleId(null)} centered size="lg">
        <Modal.Header closeButton><Modal.Title>{unidadDetalleQuery.data ? `${nombreTipoUnidad(unidadDetalleQuery.data.tipo)} · ${unidadDetalleQuery.data.codigo}` : 'Ficha de unidad'}</Modal.Title></Modal.Header><Modal.Body>
          {unidadDetalleQuery.isPending ? <p>Cargando ficha…</p> : unidadDetalleQuery.data && <><dl className="row"><dt className="col-sm-4">Estado</dt><dd className="col-sm-8">{unidadDetalleQuery.data.activa ? 'Activa' : 'Inactiva'}</dd><dt className="col-sm-4">Área</dt><dd className="col-sm-8">{unidadDetalleQuery.data.areaM2 ? `${unidadDetalleQuery.data.areaM2} m²` : 'Información pendiente de completar.'}</dd><dt className="col-sm-4">Coeficiente</dt><dd className="col-sm-8">{unidadDetalleQuery.data.coeficiente ? `${unidadDetalleQuery.data.coeficiente} %` : 'Pendiente'}</dd><dt className="col-sm-4">Cuota mensual</dt><dd className="col-sm-8">{dinero(unidadDetalleQuery.data.cuotaMensual)}</dd><dt className="col-sm-4">Matrícula inmobiliaria</dt><dd className="col-sm-8">{unidadDetalleQuery.data.matriculaInmobiliaria || 'Pendiente'}</dd><dt className="col-sm-4">Estado jurídico</dt><dd className="col-sm-8">{unidadDetalleQuery.data.estadoJuridico || 'Pendiente'}</dd></dl><h6>Historial de titulares</h6>{unidadDetalleQuery.data.titularidades.map((t) => <div className="border-bottom py-2" key={t.id}>{t.propietario.nombre} · {t.tipo === 'COTITULAR' ? 'Cotitular' : 'Titular'} · {t.hasta ? `Finalizó ${fecha(t.hasta)}` : 'Vigente'} · {nombreEstadoTitularidad(t.estado)}</div>)}<h6 className="mt-3">Cambios registrados</h6>{unidadHistorialQuery.isPending ? <p>Cargando bitácora…</p> : unidadHistorialQuery.data?.length ? unidadHistorialQuery.data.map((h) => <details className="border-bottom py-2" key={String(h.id)}><summary>{new Date(h.createdAt).toLocaleString('es-CO')} · {h.accion} · {h.actorId || 'Sistema'}</summary><pre className="small text-wrap">{JSON.stringify({ antes: h.antes, despues: h.despues }, null, 2)}</pre></details>) : <p className="text-body-secondary">Sin cambios registrados.</p>}</>}
        </Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setUnidadDetalleId(null)}>Cerrar</Button></Modal.Footer>
      </Modal>

      <Modal show={!!importar} onHide={() => setImportar(null)} centered size="xl">
        <Modal.Header closeButton><Modal.Title>Importar propietarios desde Excel</Modal.Title></Modal.Header><Modal.Body>
          <p className="small text-body-secondary">La lectura no guarda registros. Los códigos nuevos se crearán automáticamente al aprobar si tipoUnidad indica VILLA o LOTE. Las nuevas titularidades quedan pendientes de validación administrativa. No se importan saldos ni pagos.</p>
          {importar && <><div className="row g-2 mb-3">{[['nombre','Nombre / razón social'],['unidad','Código de unidad']].map(([campo, etiqueta]) => <div className="col-md-6" key={campo}><Form.Label>{etiqueta} *</Form.Label><Form.Select value={importar.mapeo[campo] ?? ''} onChange={(e) => setImportar({ ...importar, mapeo: { ...importar.mapeo, [campo]: e.target.value }, vista: undefined })}><option value="">Seleccionar columna</option>{importar.columnas.map((c) => <option key={c}>{c}</option>)}</Form.Select></div>)}{[['tipoDocumento','Tipo de documento'],['numeroDocumento','Número de documento'],['telefono','Teléfono'],['correo','Correo'],['direccion','Dirección'],['tipoUnidad','Tipo de unidad'],['tipoTitularidad','Relación'],['fuente','Fuente']].map(([campo, etiqueta]) => <div className="col-md-3" key={campo}><Form.Label>{etiqueta}</Form.Label><Form.Select value={importar.mapeo[campo] ?? ''} onChange={(e) => setImportar({ ...importar, mapeo: { ...importar.mapeo, [campo]: e.target.value }, vista: undefined })}><option value="">No asignar</option>{importar.columnas.map((c) => <option key={c}>{c}</option>)}</Form.Select></div>)}</div>
          {!importar.vista ? <Button onClick={() => void propietariosApi.previsualizarImportacion(importar.archivo, importar.filas, importar.mapeo).then((vista) => { setImportar({ ...importar, vista, crearUnidades: vista.filas.some(unidadNuevaCreable) }); void importacionesQuery.refetch(); }).catch((error: unknown) => setAviso({ tono: 'error', texto: mensajeDe(error) }))} disabled={!importar.mapeo.nombre || !importar.mapeo.unidad}>Generar vista previa y enviar a revisión</Button> : <><div className="alert alert-info">{importar.vista.resumen.total} filas · {importar.vista.resumen.sinAlertas} listas · {importar.vista.resumen.conAlertas} con observaciones.{importar.vista.filas.some(unidadNuevaCreable) && importar.crearUnidades && <> {importar.vista.filas.filter(unidadNuevaCreable).length} filas con códigos nuevos se crearán como Villa o Lote al aprobar.</>}{importar.vista.filas.some((f) => f.unidadDesconocida && !unidadNuevaCreable(f)) && <> Los códigos sin tipo Villa o Lote indicado u otras alertas requieren corrección y no se crearán.</>} El borrador queda guardado para revisión administrativa.</div><div className="table-responsive" style={{ maxHeight: '45vh' }}><Table size="sm" striped><thead><tr><th>Estado</th><th>Fila</th><th>Propietario</th><th>Documento</th><th>Unidad</th><th>Tipo</th><th>Observaciones</th></tr></thead><tbody>{importar.vista.filas.map((f) => <tr key={f.fila}><td>{f.unidadDesconocida && unidadNuevaCreable(f) ? <Etiqueta tono="aviso">Se creará</Etiqueta> : f.alertas.length ? <Etiqueta tono="aviso">Revisar</Etiqueta> : <Etiqueta tono="ok">Lista</Etiqueta>}</td><td>{f.fila}</td><td>{f.datos.nombre || 'Pendiente'}</td><td>{f.datos.tipoDocumento} {f.datos.numeroDocumento}</td><td>{f.datos.unidad}</td><td>{f.datos.tipoUnidad || 'No indicado'}</td><td>{f.unidadDesconocida && unidadNuevaCreable(f) ? 'Se creará automáticamente al aprobar' : f.alertas.length ? f.alertas.join('; ') : 'Sin diferencias detectadas'}</td></tr>)}</tbody></Table></div></>}
          </>}
        </Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => setImportar(null)}>Cerrar</Button>{importar?.vista && <>{puedeAprobar ? <><Button variant="outline-danger" onClick={() => { if (!window.confirm('¿Rechazar esta importación pendiente?')) return; void propietariosApi.rechazarImportacion(importar.vista!.id).then(() => { setImportar(null); void importacionesQuery.refetch(); }).catch((error: unknown) => setAviso({ tono: 'error', texto: mensajeDe(error) })); }}>Rechazar</Button><Button variant="primary" disabled={!importar.vista.filas.some((f) => filaAprobable(f, importar.crearUnidades))} onClick={() => { const filasAprobadas = importar.vista!.filas.filter((f) => filaAprobable(f, importar.crearUnidades)).length; if (!window.confirm(`Se aplicarán ${filasAprobadas} filas revisadas. Las titularidades quedarán pendientes de validación. ¿Desea aprobar?`)) return; void propietariosApi.aprobarImportacion(importar.vista!.id, importar.crearUnidades).then((r) => { setImportar(null); setAviso({ tono: 'ok', texto: `Importación aplicada: ${r.propietarios} propietarios, ${r.unidades} unidades y ${r.vinculaciones} vinculaciones.` }); void Promise.all([recargar(), importacionesQuery.refetch()]); }).catch((error: unknown) => setAviso({ tono: 'error', texto: mensajeDe(error) })); }}>Aprobar e importar</Button></> : <span className="small text-body-secondary">Pendiente de aprobación por una administradora.</span>}</>}</Modal.Footer>
      </Modal>
      {vista === 'unidades' && (
        <TablaUnidades
          datos={unidades}
          cargando={unidadesQuery.isPending}
          puedeEditar={puedeEditar}
          alDetalle={(u) => setUnidadDetalleId(u.id)}
          alEditar={(u) => setUnidadForm({
            id: u.id,
            codigo: u.codigo,
            tipo: u.tipo,
            areaM2: u.areaM2 ?? '',
            coeficiente: u.coeficiente ?? '',
            cuotaMensual: u.cuotaMensual ?? '',
            matriculaInmobiliaria: u.matriculaInmobiliaria ?? '',
            estadoJuridico: u.estadoJuridico ?? '',
            activa: u.activa,
          })}
        />
      )}
      {vista === 'titularidades' && (
        <TablaTitularidades
          datos={titularidades}
          cargando={titularidadesQuery.isPending}
          puedeAprobar={puedeAprobar}
          puedeEditar={puedeEditar}
          alCerrar={(id) => { setCerrarId(id); setFechaFin(fechaHoy()); }}
          alRevisar={(id, estado) => {
            setAviso(null);
            void mutacion.mutateAsync(() => propietariosApi.revisarTitularidad(id, estado));
          }}
        />
      )}

      <Modal show={!!propietarioForm} onHide={() => setPropietarioForm(null)} centered size="lg">
        <Modal.Header closeButton><Modal.Title>{propietarioForm?.id ? 'Editar propietario' : 'Nuevo propietario'}</Modal.Title></Modal.Header>
        <Form onSubmit={(e) => void guardarPropietario(e)}>
          <Modal.Body>
            <div className="row g-3">
              <div className="col-md-4"><Form.Group><Form.Label>Tipo de persona *</Form.Label><Form.Select required value={propietarioForm?.tipoPersona ?? 'NATURAL'} onChange={(e) => setPropietarioForm((v) => v && ({ ...v, tipoPersona: e.target.value as TipoPersonaPropietaria }))}><option value="NATURAL">Persona natural</option><option value="JURIDICA">Persona jurídica</option></Form.Select></Form.Group></div>
              <div className="col-md-8"><Form.Group><Form.Label>Nombre o razón social *</Form.Label><Form.Control required maxLength={180} value={propietarioForm?.nombre ?? ''} onChange={(e) => setPropietarioForm((v) => v && ({ ...v, nombre: e.target.value }))} /></Form.Group></div>
              <div className="col-md-4"><Form.Group><Form.Label>Tipo de documento</Form.Label><Form.Select value={propietarioForm?.tipoDocumento ?? ''} onChange={(e) => setPropietarioForm((v) => v && ({ ...v, tipoDocumento: e.target.value }))}><option value="">Selecciona un tipo</option>{propietarioForm?.tipoDocumento && !TIPOS_DOCUMENTO.some(([codigo]) => codigo === propietarioForm.tipoDocumento) && <option value={propietarioForm.tipoDocumento}>{propietarioForm.tipoDocumento}</option>}{TIPOS_DOCUMENTO.map(([codigo, etiqueta]) => <option key={codigo} value={codigo}>{etiqueta}</option>)}</Form.Select></Form.Group></div>
              <div className="col-md-8"><Form.Group><Form.Label>Número de documento</Form.Label><Form.Control maxLength={80} value={propietarioForm?.numeroDocumento ?? ''} onChange={(e) => setPropietarioForm((v) => v && ({ ...v, numeroDocumento: e.target.value }))} /></Form.Group></div>
              <div className="col-md-6"><Form.Group><Form.Label>Teléfono</Form.Label><Form.Control type="tel" maxLength={40} value={propietarioForm?.telefono ?? ''} onChange={(e) => setPropietarioForm((v) => v && ({ ...v, telefono: e.target.value }))} /></Form.Group></div>
              <div className="col-md-6"><Form.Group><Form.Label>Correo electrónico</Form.Label><Form.Control type="email" maxLength={254} value={propietarioForm?.correo ?? ''} onChange={(e) => setPropietarioForm((v) => v && ({ ...v, correo: e.target.value }))} /></Form.Group></div>
              <div className="col-12"><Form.Group><Form.Label>Dirección</Form.Label><Form.Control maxLength={300} value={propietarioForm?.direccion ?? ''} onChange={(e) => setPropietarioForm((v) => v && ({ ...v, direccion: e.target.value }))} /></Form.Group></div>
              {propietarioForm?.id && <div className="col-12"><Form.Check type="switch" label="Registro activo" checked={propietarioForm.activo} onChange={(e) => setPropietarioForm((v) => v && ({ ...v, activo: e.target.checked }))} /></div>}
            </div>
            <p className="small text-body-secondary mt-3 mb-0">Los datos faltantes pueden quedar vacíos y completarse después. Las vinculaciones se revisan por separado.</p>
          </Modal.Body>
          <Modal.Footer><Button variant="outline-secondary" onClick={() => setPropietarioForm(null)}>Cancelar</Button><Button type="submit" disabled={mutacion.isPending}>{mutacion.isPending ? 'Guardando…' : 'Guardar propietario'}</Button></Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!unidadForm} onHide={() => setUnidadForm(null)} centered size="lg">
        <Modal.Header closeButton><Modal.Title>{unidadForm?.id ? 'Editar unidad' : 'Nueva unidad'}</Modal.Title></Modal.Header>
        <Form onSubmit={(e) => void guardarUnidad(e)}>
          <Modal.Body>
            <div className="row g-3">
              <div className="col-md-6"><Form.Group><Form.Label>Código de unidad *</Form.Label><Form.Control required maxLength={60} value={unidadForm?.codigo ?? ''} onChange={(e) => setUnidadForm((v) => v && ({ ...v, codigo: e.target.value }))} placeholder="Villa 01 / Lote 01" /></Form.Group></div>
              <div className="col-md-6"><Form.Group><Form.Label>Tipo *</Form.Label><Form.Select required value={unidadForm?.tipo ?? 'VILLA'} onChange={(e) => setUnidadForm((v) => v && ({ ...v, tipo: e.target.value as TipoUnidadPrivada }))}><option value="VILLA">Villa</option><option value="LOTE">Lote</option></Form.Select></Form.Group></div>
              <div className="col-md-4"><Form.Group><Form.Label>Área (m²)</Form.Label><Form.Control type="number" step="0.01" min="0.01" value={unidadForm?.areaM2 ?? ''} onChange={(e) => setUnidadForm((v) => v && ({ ...v, areaM2: e.target.value }))} /></Form.Group></div>
              <div className="col-md-4"><Form.Group><Form.Label>Coeficiente (%)</Form.Label><Form.Control type="number" step="0.000001" min="0" max="100" value={unidadForm?.coeficiente ?? ''} onChange={(e) => setUnidadForm((v) => v && ({ ...v, coeficiente: e.target.value }))} /></Form.Group></div>
              <div className="col-md-4"><Form.Group><Form.Label>Cuota mensual</Form.Label><Form.Control type="number" step="0.01" min="0" value={unidadForm?.cuotaMensual ?? ''} onChange={(e) => setUnidadForm((v) => v && ({ ...v, cuotaMensual: e.target.value }))} /></Form.Group></div>
              <div className="col-md-6"><Form.Group><Form.Label>Matrícula inmobiliaria</Form.Label><Form.Control maxLength={80} value={unidadForm?.matriculaInmobiliaria ?? ''} onChange={(e) => setUnidadForm((v) => v && ({ ...v, matriculaInmobiliaria: e.target.value }))} /></Form.Group></div>
              <div className="col-md-6"><Form.Group><Form.Label>Estado jurídico</Form.Label><Form.Control maxLength={120} value={unidadForm?.estadoJuridico ?? ''} onChange={(e) => setUnidadForm((v) => v && ({ ...v, estadoJuridico: e.target.value }))} /></Form.Group></div>
              {unidadForm?.id && <div className="col-12"><Form.Check type="switch" label="Unidad activa" checked={unidadForm.activa} onChange={(e) => setUnidadForm((v) => v && ({ ...v, activa: e.target.checked }))} /></div>}
            </div>
            <p className="small text-body-secondary mt-3 mb-0">Una unidad conserva su código y su historial de titulares aunque se desactive.</p>
          </Modal.Body>
          <Modal.Footer><Button variant="outline-secondary" onClick={() => setUnidadForm(null)}>Cancelar</Button><Button type="submit" disabled={mutacion.isPending}>{mutacion.isPending ? 'Guardando…' : 'Guardar unidad'}</Button></Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!titularidadForm} onHide={() => setTitularidadForm(null)} centered>
        <Modal.Header closeButton><Modal.Title>Vincular propietario a unidad</Modal.Title></Modal.Header>
        <Form onSubmit={(e) => void guardarTitularidad(e)}>
          <Modal.Body>
            <p className="small text-body-secondary">La nueva vinculación queda pendiente de validación y conserva la fuente indicada.</p>
            <Form.Group className="mb-3"><Form.Label>Propietario *</Form.Label><Form.Select required value={titularidadForm?.propietarioId ?? ''} onChange={(e) => setTitularidadForm((v) => v && ({ ...v, propietarioId: e.target.value }))}><option value="">Selecciona un propietario</option>{personasActivas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Unidad *</Form.Label><Form.Select required value={titularidadForm?.unidadId ?? ''} onChange={(e) => setTitularidadForm((v) => v && ({ ...v, unidadId: e.target.value }))}><option value="">Selecciona una unidad</option>{unidadesActivas.map((u) => <option key={u.id} value={u.id}>{nombreTipoUnidad(u.tipo)} · {u.codigo}</option>)}</Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Relación *</Form.Label><Form.Select required value={titularidadForm?.tipo ?? 'TITULAR'} onChange={(e) => setTitularidadForm((v) => v && ({ ...v, tipo: e.target.value as TipoTitularidad }))}><option value="TITULAR">Titular</option><option value="COTITULAR">Cotitular</option></Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Fecha de inicio</Form.Label><Form.Control type="date" value={titularidadForm?.desde ?? ''} onChange={(e) => setTitularidadForm((v) => v && ({ ...v, desde: e.target.value }))} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Fuente</Form.Label><Form.Control maxLength={240} value={titularidadForm?.fuente ?? ''} onChange={(e) => setTitularidadForm((v) => v && ({ ...v, fuente: e.target.value }))} placeholder="Listado, fecha, documento…" /></Form.Group>
            <Form.Group><Form.Label>Referencia del soporte</Form.Label><Form.Control maxLength={500} value={titularidadForm?.soporte ?? ''} onChange={(e) => setTitularidadForm((v) => v && ({ ...v, soporte: e.target.value }))} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="outline-secondary" onClick={() => setTitularidadForm(null)}>Cancelar</Button><Button type="submit" disabled={mutacion.isPending}>{mutacion.isPending ? 'Guardando…' : 'Crear vinculación'}</Button></Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!cerrarId} onHide={() => setCerrarId(null)} centered>
        <Modal.Header closeButton><Modal.Title>Finalizar titularidad vigente</Modal.Title></Modal.Header>
        <Modal.Body><Form.Group><Form.Label>Fecha de finalización *</Form.Label><Form.Control type="date" required value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></Form.Group><p className="small text-body-secondary mt-2 mb-0">El registro histórico se conserva con esta fecha.</p></Modal.Body>
        <Modal.Footer><Button variant="outline-secondary" onClick={() => setCerrarId(null)}>Cancelar</Button><Button variant="primary" onClick={() => void terminarTitularidad()} disabled={mutacion.isPending || !fechaFin}>Guardar fecha</Button></Modal.Footer>
      </Modal>
    </>
  );
}

function TablaPropietarios({
  datos,
  cargando,
  puedeEditar,
  alDetalle,
  alEditar,
}: {
  datos: Propietario[];
  cargando: boolean;
  puedeEditar: boolean;
  alDetalle: (propietario: Propietario) => void;
  alEditar: (propietario: Propietario) => void;
}) {
  if (cargando) return <Card body><div role="status">Cargando propietarios…</div></Card>;
  if (!datos.length) return <Card><EstadoVacio icono="bi-people" titulo="No hay propietarios para mostrar">Los datos faltantes se pueden completar más adelante.</EstadoVacio></Card>;
  return <Card><Table responsive hover className="align-middle mb-0"><caption className="visually-hidden">Propietarios de la copropiedad</caption><thead className="table-light"><tr><th scope="col" className="ps-4">Nombre</th><th scope="col">Documento</th><th scope="col">Contacto</th><th scope="col">Unidades vinculadas</th><th scope="col">Estado</th><th scope="col" className="pe-4"><span className="visually-hidden">Acciones</span></th></tr></thead><tbody>{datos.map((p) => <tr key={p.id}><td className="ps-4"><button type="button" className="btn btn-link p-0 text-decoration-none fw-semibold" onClick={() => alDetalle(p)}>{p.nombre}</button><span className="d-block small text-body-secondary">{p.tipoPersona === 'JURIDICA' ? 'Persona jurídica' : 'Persona natural'}</span></td><td>{p.tipoDocumento || p.numeroDocumento ? <><span className="badge rounded-pill bg-primary-subtle text-primary-emphasis me-1">{p.tipoDocumento === 'PA' || p.tipoDocumento === 'PASAPORTE' ? 'Pasaporte' : p.tipoDocumento || 'Documento'}</span>{p.numeroDocumento}</> : <span className="text-body-secondary">Información pendiente de completar.</span>}</td><td>{p.telefono || p.correo ? <>{p.telefono && <span className="d-block"><i className="bi bi-telephone me-1 text-body-secondary" aria-hidden="true" />{p.telefono}</span>}{p.correo && <span className="small text-body-secondary"><i className="bi bi-envelope me-1" aria-hidden="true" />{p.correo}</span>}</> : <span className="text-body-secondary">Pendiente</span>}</td><td>{p.titularidades.length ? p.titularidades.map((t) => <Badge bg="" className="bg-info-subtle text-info-emphasis border border-info-subtle me-1 mb-1" key={t.id}><i className="bi bi-house-door me-1" aria-hidden="true" />{t.unidad.codigo}</Badge>) : <span className="text-body-secondary">Sin unidad</span>}</td><td><Etiqueta tono={p.activo ? 'ok' : 'aviso'}>{p.activo ? 'Activo' : 'Inactivo'}</Etiqueta></td><td className="pe-4 text-end"><div className="d-flex justify-content-end gap-1"><Button size="sm" variant="outline-secondary" aria-label={`Ver ficha de ${p.nombre}`} onClick={() => alDetalle(p)}><i className="bi bi-eye" aria-hidden="true" /></Button>{puedeEditar && <Button size="sm" variant="outline-primary" aria-label={`Editar ${p.nombre}`} onClick={() => alEditar(p)}><i className="bi bi-pencil-square me-sm-1" aria-hidden="true" /><span className="d-none d-sm-inline">Editar</span></Button>}</div></td></tr>)}</tbody></Table></Card>;
}

function TablaUnidades({
  datos,
  cargando,
  puedeEditar,
  alDetalle,
  alEditar,
}: {
  datos: UnidadPrivada[];
  cargando: boolean;
  puedeEditar: boolean;
  alDetalle: (unidad: UnidadPrivada) => void;
  alEditar: (unidad: UnidadPrivada) => void;
}) {
  if (cargando) return <Card body><div role="status">Cargando unidades…</div></Card>;
  if (!datos.length) return <Card><EstadoVacio icono="bi-houses" titulo="No hay unidades para mostrar">Registre las unidades con el código disponible y deje los demás campos pendientes si hace falta.</EstadoVacio></Card>;
  return <Card><Table responsive hover className="align-middle mb-0"><caption className="visually-hidden">Unidades privadas de la copropiedad</caption><thead className="table-light"><tr><th scope="col" className="ps-4">Unidad</th><th scope="col">Área</th><th scope="col">Coeficiente</th><th scope="col">Cuota mensual</th><th scope="col">Propietarios</th><th scope="col">Estado</th><th scope="col" className="pe-4"><span className="visually-hidden">Acciones</span></th></tr></thead><tbody>{datos.map((u) => <tr key={u.id}><td className="ps-4"><button type="button" className="btn btn-link p-0 text-decoration-none fw-semibold" onClick={() => alDetalle(u)}>{nombreTipoUnidad(u.tipo)} · {u.codigo}</button>{u.matriculaInmobiliaria && <span className="d-block small text-body-secondary">Matrícula {u.matriculaInmobiliaria}</span>}</td><td>{u.areaM2 ? `${u.areaM2} m²` : <span className="text-body-secondary">Pendiente</span>}</td><td>{u.coeficiente ? `${u.coeficiente} %` : <span className="text-body-secondary">Pendiente</span>}</td><td>{dinero(u.cuotaMensual)}</td><td>{u.titularidades.length ? u.titularidades.map((t) => <span className="d-block" key={t.id}>{t.propietario.nombre}<small className="text-body-secondary"> · {t.tipo === 'COTITULAR' ? 'cotitular' : 'titular'}</small></span>) : <span className="text-body-secondary">Sin propietario</span>}</td><td><Etiqueta tono={u.activa ? 'ok' : 'aviso'}>{u.activa ? 'Activa' : 'Inactiva'}</Etiqueta></td><td className="pe-4 text-end"><div className="d-flex justify-content-end gap-1"><Button size="sm" variant="outline-secondary" aria-label={`Ver ficha de ${u.codigo}`} onClick={() => alDetalle(u)}><i className="bi bi-eye" aria-hidden="true" /></Button>{puedeEditar && <Button size="sm" variant="outline-primary" onClick={() => alEditar(u)}>Editar</Button>}</div></td></tr>)}</tbody></Table></Card>;
}

function TablaTitularidades({
  datos,
  cargando,
  puedeAprobar,
  puedeEditar,
  alCerrar,
  alRevisar,
}: {
  datos: Awaited<ReturnType<typeof propietariosApi.listarTitularidades>>;
  cargando: boolean;
  puedeAprobar: boolean;
  puedeEditar: boolean;
  alCerrar: (id: string) => void;
  alRevisar: (id: string, estado: EstadoTitularidad) => void;
}) {
  if (cargando) return <Card body><div role="status">Cargando vinculaciones…</div></Card>;
  if (!datos.length) return <Card><EstadoVacio icono="bi-link-45deg" titulo="No hay vinculaciones">Asocie una persona con una unidad. La relación se conservará como historial.</EstadoVacio></Card>;
  return <Card><Table responsive hover className="align-middle mb-0"><caption className="visually-hidden">Historial de titulares y cotitulares por unidad</caption><thead className="table-light"><tr><th scope="col" className="ps-4">Unidad</th><th scope="col">Propietario</th><th scope="col">Relación</th><th scope="col">Vigencia</th><th scope="col">Fuente</th><th scope="col">Validación</th><th scope="col" className="pe-4"><span className="visually-hidden">Acciones</span></th></tr></thead><tbody>{datos.map((t) => <tr key={t.id}><td className="ps-4">{nombreTipoUnidad(t.unidad.tipo)} · {t.unidad.codigo}</td><td>{t.propietario.nombre}{t.propietario.numeroDocumento && <small className="d-block text-body-secondary">{t.propietario.tipoDocumento} {t.propietario.numeroDocumento}</small>}</td><td>{t.tipo === 'COTITULAR' ? 'Cotitular' : 'Titular'}</td><td>{fecha(t.desde)} — {t.hasta ? fecha(t.hasta) : <span>Vigente</span>}</td><td>{t.fuente || <span className="text-body-secondary">Pendiente</span>}</td><td><Etiqueta tono={t.estado === 'VALIDADO' ? 'ok' : t.estado === 'OBSERVADO' ? 'aviso' : 'info'}>{nombreEstadoTitularidad(t.estado)}</Etiqueta></td><td className="pe-4 text-end"><div className="d-flex justify-content-end gap-2">{puedeAprobar && t.estado !== 'VALIDADO' && <Button size="sm" variant="outline-success" onClick={() => alRevisar(t.id, 'VALIDADO')}>Validar</Button>}{puedeAprobar && t.estado !== 'OBSERVADO' && <Button size="sm" variant="outline-warning" onClick={() => alRevisar(t.id, 'OBSERVADO')}>Observar</Button>}{puedeEditar && !t.hasta && <Button size="sm" variant="outline-secondary" onClick={() => alCerrar(t.id)}>Finalizar</Button>}</div></td></tr>)}</tbody></Table></Card>;
}
