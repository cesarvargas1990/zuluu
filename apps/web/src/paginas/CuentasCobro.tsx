import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { permisosPorDefecto } from '@zulu/shared';
import { useMemo, useState } from 'react';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Nav from 'react-bootstrap/Nav';
import Table from 'react-bootstrap/Table';
import { cuentasCobroApi, type CuentaCobro } from '@/api/cuentas-cobro';
import { propietariosApi } from '@/api/propietarios';
import { KpiCard } from '@/componentes/dashboard/KpiCard';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { Alerta, Boton, Etiqueta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { useSesion } from '@/sesion/SesionProvider';
import { dinero, fecha, hoy } from './recaudos/formato';

type Vista = 'resumen' | 'configurar' | 'previa' | 'aprobar' | 'historial';
const PESTANAS: [Vista, string, string][] = [
  ['resumen', 'Resumen y lotes', 'bi-grid-1x2'],
  ['configurar', 'Configurar periodo', 'bi-calendar2-plus'],
  ['previa', 'Vista previa', 'bi-file-earmark-text'],
  ['aprobar', 'Aprobar y emitir', 'bi-patch-check'],
  ['historial', 'Historial y envíos', 'bi-clock-history'],
];
const DEMO = [
  {
    numero: 'DEMO-2026-001',
    unidad: 'Villa DEMO-01',
    estado: 'Emitido',
    envio: 'Enviado',
    total: '470000',
  },
  {
    numero: 'DEMO-2026-002',
    unidad: 'Villa DEMO-02',
    estado: 'Emitido',
    envio: 'Pendiente',
    total: '390000',
  },
];
const TITULOS: Record<CuentaCobro['estado'], string> = {
  BORRADOR: 'Borrador',
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
  APROBADO: 'Aprobado',
  EMITIDO: 'Emitido',
  ANULADO: 'Anulado',
};
const conceptosDefault = [
  'Cuota de administración',
  'Cuotas extraordinarias',
  'Intereses',
  'Otros conceptos autorizados',
];
const periodoActual = hoy().slice(0, 7);
const errorDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error inesperado.');

export function CuentasCobro() {
  useTitulo('Cuentas de cobro');
  const { condominioActivo } = useSesion();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<Vista>('resumen');
  const [periodoId, setPeriodoId] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [unidadId, setUnidadId] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'aviso' | 'error'; texto: string } | null>(
    null,
  );
  const [periodo, setPeriodo] = useState(periodoActual);
  const [corte, setCorte] = useState(hoy());
  const [vencimiento, setVencimiento] = useState(`${periodoActual}-30`);
  const [conceptos, setConceptos] = useState(conceptosDefault.join('\n'));
  const [filtro, setFiltro] = useState('');
  const permisos = useMemo(() => {
    const a = condominioActivo ? permisosPorDefecto(condominioActivo.rol, '02') : [];
    return {
      editar: a.includes('editar'),
      aprobar: a.includes('aprobar'),
      exportar: a.includes('exportar'),
    };
  }, [condominioActivo]);
  const clave = ['req005', condominioActivo?.condominioId] as const;
  const datos = useQuery({ queryKey: [...clave, 'lista'], queryFn: cuentasCobroApi.listar });
  const unidades = useQuery({
    queryKey: [...clave, 'unidades'],
    queryFn: () => propietariosApi.listarUnidades('', 'activas'),
    enabled: permisos.editar,
  });
  const refrescar = () => queryClient.invalidateQueries({ queryKey: clave });
  const crear = useMutation({
    mutationFn: () =>
      cuentasCobroApi.crearPeriodo({
        periodo,
        fechaCorte: corte,
        fechaVencimiento: vencimiento,
        conceptos: conceptos
          .split('\n')
          .map((nombre) => nombre.trim())
          .filter(Boolean)
          .map((nombre) => ({ nombre })),
      }),
    onSuccess: async (p) => {
      setPeriodoId(p.id);
      setMensaje({
        tipo: 'ok',
        texto: `Periodo ${p.periodo} configurado. Los conceptos solo habilitan clasificación; no crean cargos.`,
      });
      await refrescar();
    },
  });
  const generar = useMutation({
    mutationFn: () => cuentasCobroApi.generar(periodoId),
    onSuccess: async (r) => {
      setMensaje({
        tipo: r.observadas ? 'aviso' : 'ok',
        texto: `Borradores: ${r.creadas}. Unidades ya generadas: ${r.duplicadas}. Sin saldo: ${r.sinSaldo}. Con observaciones de titularidad: ${r.observadas}.`,
      });
      setVista('aprobar');
      await refrescar();
    },
  });
  const generarUnidad = useMutation({
    mutationFn: () => cuentasCobroApi.generarUnidad(periodoId, unidadId),
    onSuccess: async (r) => {
      setMensaje({
        tipo: r.observadas ? 'aviso' : 'ok',
        texto: `Cuenta individual: ${r.creadas} creada, ${r.duplicadas} ya existente, ${r.sinSaldo} sin saldo, ${r.observadas} con observaciones.`,
      });
      setVista('aprobar');
      await refrescar();
    },
  });
  const aprobar = useMutation({
    mutationFn: cuentasCobroApi.aprobar,
    onSuccess: async () => {
      setMensaje({ tipo: 'ok', texto: 'Cuenta aprobada. Ya se puede emitir.' });
      await refrescar();
    },
  });
  const emitir = useMutation({
    mutationFn: cuentasCobroApi.emitir,
    onSuccess: async (r) => {
      setMensaje({ tipo: 'ok', texto: `Cuenta emitida con consecutivo ${r.numero}.` });
      await refrescar();
    },
  });
  const registrarEnvio = useMutation({
    mutationFn: ({ id, destinatario }: { id: string; destinatario: string }) =>
      cuentasCobroApi.registrarEnvio(id, { canal: 'CORREO', destinatario }),
    onSuccess: async (r) => {
      setMensaje(
        r.estado === 'ENVIADO'
          ? {
              tipo: 'ok',
              texto:
                'El servidor SMTP aceptó el mensaje con el PDF adjunto; la entrega final depende del proveedor de correo.',
            }
          : { tipo: 'error', texto: r.detalle ?? 'No se pudo completar el envío.' },
      );
      await refrescar();
    },
  });
  const anular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      cuentasCobroApi.anular(id, motivo),
    onSuccess: async () => {
      setMensaje({
        tipo: 'ok',
        texto: 'Cuenta anulada con trazabilidad; el consecutivo y la copia histórica se conservan.',
      });
      await refrescar();
    },
  });
  const cuentas = datos.data?.cuentas ?? [];
  const periodos = datos.data?.periodos ?? [];
  const visibles = cuentas.filter(
    (c) =>
      !filtro ||
      c.periodo.includes(filtro) ||
      c.unidad.codigo.toLowerCase().includes(filtro.toLowerCase()) ||
      c.estado.toLowerCase().includes(filtro.toLowerCase()) ||
      c.snapshot.propietarios.some((p) => p.nombre.toLowerCase().includes(filtro.toLowerCase())),
  );
  const seleccionada = cuentas.find((c) => c.id === cuentaId) ?? cuentas[0];
  const pendientes = cuentas.filter((c) => c.estado === 'PENDIENTE_APROBACION').length;
  const emitidas = cuentas.filter((c) => c.estado === 'EMITIDO').length;
  const enviosPendientes = cuentas.filter(
    (c) => c.estado === 'EMITIDO' && (!c.envios.length || c.envios[0].estado !== 'ENVIADO'),
  ).length;

  async function descargarPdf(c: CuentaCobro) {
    try {
      const blob = await cuentasCobroApi.pdf(c.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cuenta-cobro-${c.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: errorDe(e) });
    }
  }
  function exportar() {
    const filas = [
      ['Documento', 'Unidad', 'Periodo', 'Estado', 'Total', 'Envío'],
      ...visibles.map((c) => [
        c.numero ?? c.id,
        `${c.unidad.tipo} ${c.unidad.codigo}`,
        c.periodo,
        TITULOS[c.estado],
        c.total,
        c.envios[0]?.estado ?? 'Sin registro',
      ]),
    ];
    const csv = filas
      .map((fila) => fila.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuentas-cobro-${hoy()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        titulo="Cuentas de cobro"
        descripcion={`Generación, validación y seguimiento de documentos por periodo para ${condominioActivo?.razonSocial ?? 'la copropiedad'}.`}
        acciones={
          permisos.exportar ? (
            <Boton variante="secundario" onClick={exportar}>
              <i className="bi bi-download" aria-hidden="true" /> Exportar
            </Boton>
          ) : undefined
        }
      />
      {mensaje && (
        <Alerta tono={mensaje.tipo} className="mb-3">
          {mensaje.texto}
        </Alerta>
      )}
      {datos.isError && (
        <Alerta tono="error" className="mb-3">
          {errorDe(datos.error)}. La información de demostración sigue disponible abajo.
        </Alerta>
      )}
      <div className="row g-3 mb-4">
        <div className="col-6 col-xl-3">
          <KpiCard
            etiqueta="Borradores"
            valor={
              cuentas.filter((c) => c.estado === 'BORRADOR' || c.estado === 'PENDIENTE_APROBACION')
                .length || (datos.isError ? '42 demo' : '0')
            }
            icono="bi-file-earmark"
            detalle="Pendientes de revisión"
          />
        </div>
        <div className="col-6 col-xl-3">
          <KpiCard
            etiqueta="Por revisar"
            valor={pendientes || (datos.isError ? '3 demo' : '0')}
            icono="bi-exclamation-circle"
            detalle="Requieren aprobación"
          />
        </div>
        <div className="col-6 col-xl-3">
          <KpiCard
            etiqueta="Emitidos"
            valor={emitidas || (datos.isError ? '36 demo' : '0')}
            icono="bi-file-earmark-check"
            detalle="Consecutivo asignado"
          />
        </div>
        <div className="col-6 col-xl-3">
          <KpiCard
            etiqueta="Envíos pendientes"
            valor={enviosPendientes || (datos.isError ? '6 demo' : '0')}
            icono="bi-envelope"
            detalle="Con entrega por registrar"
          />
        </div>
      </div>
      <Card className="mb-4">
        <Card.Body className="p-0">
          <Nav
            variant="tabs"
            activeKey={vista}
            onSelect={(k) => k && setVista(k as Vista)}
            className="px-3 pt-2 overflow-auto flex-nowrap"
            aria-label="Secciones de cuentas de cobro"
          >
            {PESTANAS.map(([key, label, icon]) => (
              <Nav.Item key={key}>
                <Nav.Link eventKey={key} className="text-nowrap">
                  <i className={`bi ${icon} me-2`} aria-hidden="true" />
                  {label}
                </Nav.Link>
              </Nav.Item>
            ))}
          </Nav>
          <div className="p-3 p-lg-4">
            {vista === 'resumen' && (
              <>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                  <div>
                    <h2 className="h5 mb-1">Lotes por periodo</h2>
                    <p className="text-body-secondary mb-0">
                      Los borradores se calculan desde obligaciones y movimientos de cartera
                      conciliados.
                    </p>
                  </div>
                  {permisos.editar && (
                    <Boton onClick={() => setVista('configurar')}>
                      <i className="bi bi-plus-lg" /> Nuevo periodo
                    </Boton>
                  )}
                </div>
                {periodos.length ? (
                  <Table responsive hover>
                    <thead>
                      <tr>
                        <th>Periodo</th>
                        <th>Unidades</th>
                        <th>Estado</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodos.map((p) => (
                        <tr key={p.id}>
                          <td>{p.periodo}</td>
                          <td>{p._count.cuentas || '—'}</td>
                          <td>
                            <Etiqueta tono={p.estado === 'CERRADO' ? 'ok' : 'info'}>
                              {p.estado === 'BORRADORES_GENERADOS'
                                ? 'En revisión'
                                : p.estado === 'CERRADO'
                                  ? 'Cerrado'
                                  : 'Configurado'}
                            </Etiqueta>
                          </td>
                          <td>
                            <Boton
                              variante="enlace"
                              onClick={() => {
                                setPeriodoId(p.id);
                                setVista('aprobar');
                              }}
                            >
                              Revisar
                            </Boton>
                            {permisos.editar && p.estado === 'CONFIGURADO' && (
                              <Boton
                                variante="secundario"
                                className="ms-2"
                                onClick={() => {
                                  setPeriodoId(p.id);
                                  generar.mutate();
                                }}
                                cargando={generar.isPending}
                              >
                                Generar borradores
                              </Boton>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <div className="row g-3">
                    <div className="col-md-6">
                      <Card className="border">
                        <Card.Body>
                          <div className="d-flex justify-content-between">
                            <div>
                              <h3 className="h6">Noviembre 2026</h3>
                              <p className="text-body-secondary mb-2">
                                42 unidades · Lote ilustrativo
                              </p>
                            </div>
                            <Etiqueta tono="aviso">En revisión</Etiqueta>
                          </div>
                          <small className="text-body-secondary">
                            DEMO · Los registros no corresponden al condominio ni a cartera real.
                          </small>
                        </Card.Body>
                      </Card>
                    </div>
                    <div className="col-md-6">
                      <Card className="border">
                        <Card.Body>
                          <div className="d-flex justify-content-between">
                            <div>
                              <h3 className="h6">Octubre 2026</h3>
                              <p className="text-body-secondary mb-2">
                                42 unidades · Lote ilustrativo
                              </p>
                            </div>
                            <Etiqueta tono="ok">Emitido</Etiqueta>
                          </div>
                          <small className="text-body-secondary">
                            DEMO · Sin PDF ni consecutivo productivo.
                          </small>
                        </Card.Body>
                      </Card>
                    </div>
                  </div>
                )}
              </>
            )}
            {vista === 'configurar' && (
              <div className="row g-4">
                <div className="col-lg-7">
                  <h2 className="h5">Configurar periodo</h2>
                  <p className="text-body-secondary">
                    Defina fechas y conceptos autorizados antes de preparar cuentas.
                  </p>
                  <Form
                    onSubmit={(e) => {
                      e.preventDefault();
                      crear.mutate();
                    }}
                  >
                    <div className="row g-3">
                      <Form.Group className="col-md-4">
                        <Form.Label>Periodo</Form.Label>
                        <Form.Control
                          type="month"
                          value={periodo}
                          onChange={(e) => setPeriodo(e.target.value)}
                          required
                        />
                      </Form.Group>
                      <Form.Group className="col-md-4">
                        <Form.Label>Fecha de corte</Form.Label>
                        <Form.Control
                          type="date"
                          value={corte}
                          onChange={(e) => setCorte(e.target.value)}
                          required
                        />
                      </Form.Group>
                      <Form.Group className="col-md-4">
                        <Form.Label>Vencimiento</Form.Label>
                        <Form.Control
                          type="date"
                          value={vencimiento}
                          onChange={(e) => setVencimiento(e.target.value)}
                          required
                        />
                      </Form.Group>
                      <Form.Group className="col-12">
                        <Form.Label>Conceptos autorizados (uno por línea)</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={4}
                          value={conceptos}
                          onChange={(e) => setConceptos(e.target.value)}
                          required
                        />
                        <Form.Text>
                          Las tarifas, intereses y descuentos deben provenir de parámetros
                          aprobados. Este formulario no genera cargos.
                        </Form.Text>
                      </Form.Group>
                      <div className="col-12">
                        <Boton type="submit" cargando={crear.isPending} disabled={!permisos.editar}>
                          Guardar periodo
                        </Boton>
                      </div>
                    </div>
                  </Form>
                  {crear.isError && (
                    <Alerta tono="error" className="mt-3">
                      {errorDe(crear.error)}
                    </Alerta>
                  )}
                </div>
                <div className="col-lg-5">
                  <Alerta tono="info">
                    Después de guardar, selecciona «Generar borradores» desde el lote. Solo se
                    incluyen saldos existentes al corte; las obligaciones no se modifican.
                  </Alerta>
                </div>
              </div>
            )}
            {vista === 'previa' && (
              <div className="row g-4">
                <div className="col-lg-7">
                  <h2 className="h5">Vista previa del documento</h2>
                  {seleccionada ? (
                    <article className="cuenta-cobro-papel">
                      <header className="d-flex justify-content-between border-bottom pb-3">
                        <div>
                          <strong className="text-success">
                            {condominioActivo?.razonSocial ?? 'MAJAGUA'}
                          </strong>
                          <div className="small text-body-secondary">
                            CUENTA DE COBRO · {TITULOS[seleccionada.estado].toUpperCase()}
                          </div>
                        </div>
                        <span className="text-body-secondary">
                          {seleccionada.numero ?? 'BORRADOR'}
                        </span>
                      </header>
                      <div className="py-3">
                        <strong>Unidad:</strong>{' '}
                        {seleccionada.unidad.tipo === 'VILLA' ? 'Villa' : 'Lote'}{' '}
                        {seleccionada.unidad.codigo}
                        <br />
                        <strong>Propietario:</strong>{' '}
                        {seleccionada.snapshot.propietarios.map((p) => p.nombre).join(', ') ||
                          'Pendiente de validar'}
                        <br />
                        <strong>Periodo:</strong> {seleccionada.periodo} · <strong>Corte:</strong>{' '}
                        {fecha(seleccionada.fechaCorte)} · <strong>Vence:</strong>{' '}
                        {fecha(seleccionada.fechaVencimiento)}
                      </div>
                      <Table size="sm">
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Periodo</th>
                            <th className="text-end">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seleccionada.snapshot.lineas.map((l, i) => (
                            <tr key={`${l.concepto}-${i}`}>
                              <td>
                                {l.concepto}
                                {l.clase === 'SALDO_ANTERIOR' && (
                                  <small className="d-block text-body-secondary">
                                    Saldo anterior
                                  </small>
                                )}
                              </td>
                              <td>{l.periodo}</td>
                              <td className="text-end">{dinero(l.saldo)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th colSpan={2}>Total a pagar</th>
                            <th className="text-end">{dinero(seleccionada.total)}</th>
                          </tr>
                        </tfoot>
                      </Table>
                      <small className="text-body-secondary">
                        Documento administrativo. No equivale a factura electrónica DIAN.
                      </small>
                    </article>
                  ) : (
                    <div className="cuenta-cobro-papel">
                      <Etiqueta tono="aviso">DEMO · Ficticio</Etiqueta>
                      <h3 className="h5 mt-3">MAJAGUA · CUENTA DE COBRO · BORRADOR</h3>
                      <p>
                        Unidad: Villa DEMO-01 · Periodo: Noviembre 2026
                        <br />
                        Corte: 18/11/2026 · Vencimiento: 30/11/2026
                      </p>
                      <Table size="sm">
                        <tbody>
                          <tr>
                            <td>Saldo anterior (ejemplo)</td>
                            <td className="text-end">$ 120.000</td>
                          </tr>
                          <tr>
                            <td>Cuota del periodo (ejemplo)</td>
                            <td className="text-end">$ 450.000</td>
                          </tr>
                          <tr>
                            <td>Abonos verificados (ejemplo)</td>
                            <td className="text-end">−$ 100.000</td>
                          </tr>
                          <tr className="fw-bold">
                            <td>Total ilustrativo</td>
                            <td className="text-end">$ 470.000</td>
                          </tr>
                        </tbody>
                      </Table>
                      <small>Importes ficticios. No constituye documento emitido.</small>
                    </div>
                  )}
                </div>
                <div className="col-lg-5">
                  <Form.Group>
                    <Form.Label>Cuenta real para previsualizar</Form.Label>
                    <Form.Select
                      value={seleccionada?.id ?? ''}
                      onChange={(e) => setCuentaId(e.target.value)}
                    >
                      <option value="">Selecciona un borrador</option>
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.unidad.codigo} · {c.periodo} · {dinero(c.total)}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>
              </div>
            )}
            {(vista === 'aprobar' || vista === 'historial') && (
              <>
                <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
                  <div>
                    <h2 className="h5 mb-1">
                      {vista === 'aprobar'
                        ? 'Bandeja de aprobación y emisión'
                        : 'Historial y envíos'}
                    </h2>
                    <p className="text-body-secondary mb-0">
                      Consulta por documento, unidad, periodo o estado.
                    </p>
                  </div>
                  <Form.Control
                    aria-label="Buscar por unidad, periodo o estado"
                    placeholder="Buscar…"
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    style={{ maxWidth: 280 }}
                  />
                </div>
                {cuentas.length ? (
                  <Table responsive hover>
                    <thead>
                      <tr>
                        <th>Documento</th>
                        <th>Unidad</th>
                        <th>Periodo</th>
                        <th>Total</th>
                        <th>Estado</th>
                        <th>Envío</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((c) => (
                        <tr key={c.id}>
                          <td>{c.numero ?? '—'}</td>
                          <td>
                            {c.unidad.tipo === 'VILLA' ? 'Villa' : 'Lote'} {c.unidad.codigo}
                          </td>
                          <td>{c.periodo}</td>
                          <td>{dinero(c.total)}</td>
                          <td>
                            <Etiqueta
                              tono={
                                c.estado === 'EMITIDO'
                                  ? 'ok'
                                  : c.estado === 'ANULADO'
                                    ? 'error'
                                    : 'aviso'
                              }
                            >
                              {TITULOS[c.estado]}
                            </Etiqueta>
                          </td>
                          <td>
                            {c.envios[0]?.estado === 'ENVIADO'
                              ? 'Enviado'
                              : c.envios[0]?.estado === 'FALLIDO'
                                ? 'Fallido'
                                : 'Pendiente'}
                          </td>
                          <td className="text-nowrap">
                            <Boton
                              variante="enlace"
                              onClick={() => {
                                setCuentaId(c.id);
                                setVista('previa');
                              }}
                            >
                              Vista previa
                            </Boton>
                            {permisos.aprobar && c.estado === 'PENDIENTE_APROBACION' && (
                              <Boton
                                variante="secundario"
                                className="ms-1"
                                onClick={() => aprobar.mutate(c.id)}
                                cargando={aprobar.isPending}
                              >
                                Aprobar
                              </Boton>
                            )}
                            {permisos.aprobar && c.estado === 'APROBADO' && (
                              <Boton
                                className="ms-1"
                                onClick={() => emitir.mutate(c.id)}
                                cargando={emitir.isPending}
                              >
                                Emitir PDF
                              </Boton>
                            )}
                            {c.pdfDisponible && (
                              <>
                                <Boton
                                  variante="secundario"
                                  className="ms-1"
                                  onClick={() => void descargarPdf(c)}
                                >
                                  <i className="bi bi-download" /> PDF
                                </Boton>
                                {permisos.editar && (
                                  <Boton
                                    variante="secundario"
                                    className="ms-1"
                                    onClick={() => {
                                      const correo =
                                        c.snapshot.propietarios.find((p) => p.correo)?.correo ?? '';
                                      const destinatario = window.prompt(
                                        'Correo validado del propietario (el registro queda pendiente, no envía el mensaje):',
                                        correo,
                                      );
                                      if (destinatario)
                                        registrarEnvio.mutate({ id: c.id, destinatario });
                                    }}
                                  >
                                    Registrar envío
                                  </Boton>
                                )}
                              </>
                            )}
                            {permisos.aprobar && c.estado !== 'ANULADO' && (
                              <Boton
                                variante="peligro"
                                className="ms-1"
                                onClick={() => {
                                  const motivo = window.prompt(
                                    'Justificación de anulación (mínimo 10 caracteres):',
                                  );
                                  if (motivo) anular.mutate({ id: c.id, motivo });
                                }}
                              >
                                Anular
                              </Boton>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <>
                    <Alerta tono="info">Aún no hay cuentas reales en este condominio.</Alerta>
                    <Table responsive>
                      <thead>
                        <tr>
                          <th>Documento</th>
                          <th>Unidad</th>
                          <th>Estado</th>
                          <th>Envío</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DEMO.map((d) => (
                          <tr key={d.numero}>
                            <td>{d.numero}</td>
                            <td>{d.unidad}</td>
                            <td>
                              <Etiqueta tono="ok">{d.estado}</Etiqueta>
                            </td>
                            <td>{d.envio}</td>
                            <td>{dinero(d.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                    <small className="text-body-secondary">
                      Datos ilustrativos; los documentos DEMO no existen en cartera.
                    </small>
                  </>
                )}
              </>
            )}
          </div>
        </Card.Body>
      </Card>
      {(generar.isError ||
        aprobar.isError ||
        emitir.isError ||
        anular.isError ||
        registrarEnvio.isError) && (
        <Alerta tono="error">
          {errorDe(
            generar.error ?? aprobar.error ?? emitir.error ?? anular.error ?? registrarEnvio.error,
          )}
        </Alerta>
      )}
      {vista === 'resumen' && permisos.editar && periodos.length > 0 && (
        <Card className="mt-3">
          <Card.Body>
            <h2 className="h6">Generar cuentas</h2>
            <div className="row g-3 align-items-end">
              <Form.Group className="col-md-4">
                <Form.Label>Periodo configurado</Form.Label>
                <Form.Select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
                  <option value="">Selecciona un periodo</option>
                  {periodos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.periodo} · {p.estado}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group className="col-md-4">
                <Form.Label>Unidad para cuenta individual</Form.Label>
                <Form.Select value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
                  <option value="">Selecciona una unidad</option>
                  {(unidades.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.tipo === 'VILLA' ? 'Villa' : 'Lote'} {u.codigo}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <div className="col-md-4 d-flex flex-wrap gap-2">
                <Boton
                  onClick={() => generar.mutate()}
                  cargando={generar.isPending}
                  disabled={!periodoId}
                >
                  Generar lote
                </Boton>
                <Boton
                  variante="secundario"
                  onClick={() => generarUnidad.mutate()}
                  cargando={generarUnidad.isPending}
                  disabled={!periodoId || !unidadId}
                >
                  Generar individual
                </Boton>
              </div>
            </div>
          </Card.Body>
        </Card>
      )}
    </>
  );
}
