import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { permisosPorDefecto } from '@zulu/shared';
import { useEffect, useMemo, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Nav from 'react-bootstrap/Nav';
import Table from 'react-bootstrap/Table';
import {
  carteraApi,
  type Ajuste,
  type Filtros,
  type Obligacion,
  type ResultadoFilaSaldo,
  type TipoReporte,
  type VistaSaldos,
} from '@/api/cartera';
import { propietariosApi } from '@/api/propietarios';
import { EstadoVacio } from '@/componentes/dashboard/EstadoVacio';
import { KpiCard } from '@/componentes/dashboard/KpiCard';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { Alerta, Boton, Etiqueta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { useSesion } from '@/sesion/SesionProvider';
import { DetalleObligacion, EstadoCuenta, TablaObligaciones } from './cartera/Detalles';
import {
  GenerarCuotas,
  NuevaGestion,
  NuevaObligacion,
  SolicitarAjuste,
  type PermisosCartera,
} from './cartera/Dialogos';
import {
  AJUSTE,
  COMPROMISO,
  ESTADO_UNIDAD,
  TRAMOS,
  mensajeDe,
  nombreCanal,
  nombreUnidad,
} from './cartera/textos';
import {
  CONCEPTOS,
  descargar,
  dinero,
  fecha,
  fechaHora,
  hoy,
  nombreConcepto,
  nombrePeriodo,
} from './recaudos/formato';

type Vista = 'resumen' | 'obligaciones' | 'gestiones' | 'ajustes' | 'reportes';
type Aviso = { tono: 'ok' | 'aviso' | 'error'; texto: string } | null;
const VACIOS = {
  buscar: '',
  unidadId: '',
  propietarioId: '',
  estado: '',
  periodoDesde: '',
  periodoHasta: '',
  minimo: '',
  maximo: '',
};
const NUM = { fontVariantNumeric: 'tabular-nums' } as const;

/** Barra apilada de antigüedad con su leyenda en texto. */
function Antiguedad({ porTramo }: { porTramo: Record<string, string> }) {
  const total = TRAMOS.reduce((s, [t]) => s + Number(porTramo[t] ?? 0), 0);
  const clases = ['bg-success', 'bg-warning', 'antiguedad-31', 'antiguedad-61', 'bg-danger'];
  return (
    <Card className="mb-3">
      <Card.Body>
        <h2 className="h6 mb-3">Antigüedad de cartera</h2>
        {total > 0 && (
          <div className="progress mb-3" style={{ height: '0.75rem' }} aria-hidden="true">
            {TRAMOS.map(([t], i) => (
              <div
                key={t}
                className={`progress-bar ${clases[i]}`}
                style={{ width: `${(Number(porTramo[t] ?? 0) / total) * 100}%` }}
              />
            ))}
          </div>
        )}
        <dl className="row row-cols-2 row-cols-md-5 g-3 mb-0">
          {TRAMOS.map(([t, nombre], i) => (
            <div className="col" key={t}>
              <dt className="small fw-normal text-body-secondary">
                <span className={`antiguedad-punto ${clases[i]}`} aria-hidden="true" /> {nombre}
              </dt>
              <dd className="fw-semibold mb-0" style={NUM}>
                {dinero(porTramo[t] ?? 0)}
                {total > 0 && (
                  <small className="text-body-secondary fw-normal">
                    {' '}
                    · {Math.round((Number(porTramo[t] ?? 0) / total) * 100)} %
                  </small>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Card.Body>
    </Card>
  );
}

export function Cartera() {
  useTitulo('Gestión de cartera');
  const { condominioActivo } = useSesion();
  const consulta = useQueryClient();
  const permisos = useMemo<PermisosCartera>(() => {
    const a = condominioActivo ? permisosPorDefecto(condominioActivo.rol, '02') : [];
    return {
      crear: a.includes('crear'),
      editar: a.includes('editar'),
      aprobar: a.includes('aprobar'),
      exportar: a.includes('exportar'),
    };
  }, [condominioActivo]);

  const [vista, setVista] = useState<Vista>('resumen');
  const [corte, setCorte] = useState(hoy());
  const [f, setF] = useState(VACIOS);
  const [estadoObl, setEstadoObl] = useState('');
  const [concepto, setConcepto] = useState('');
  const [buscar, setBuscar] = useState('');
  useEffect(() => {
    const espera = setTimeout(() => setBuscar(f.buscar.trim()), 300);
    return () => clearTimeout(espera);
  }, [f.buscar]);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [obligacionId, setObligacionId] = useState<string | null>(null);
  const [gestionDe, setGestionDe] = useState<string | null>(null);
  const [ajusteDe, setAjusteDe] = useState<Obligacion | null>(null);
  const [dialogo, setDialogo] = useState<'obligacion' | 'generar' | null>(null);

  const clave = ['req004', condominioActivo?.condominioId] as const;
  const comunes: Filtros = {
    corte,
    buscar,
    unidadId: f.unidadId,
    propietarioId: f.propietarioId,
    periodoDesde: f.periodoDesde,
    periodoHasta: f.periodoHasta,
    minimo: f.minimo,
    maximo: f.maximo,
  };
  const filtrosUnidad: Filtros = { ...comunes, estado: f.estado };
  const filtrosObl: Filtros = { ...comunes, estado: estadoObl, concepto };
  const lista = useQuery({
    queryKey: [...clave, 'unidades', filtrosUnidad],
    queryFn: () => carteraApi.listar(filtrosUnidad),
    placeholderData: keepPreviousData,
  });
  const obligaciones = useQuery({
    queryKey: [...clave, 'obligaciones', filtrosObl],
    queryFn: () => carteraApi.obligaciones(filtrosObl),
    enabled: vista === 'obligaciones',
    placeholderData: keepPreviousData,
  });
  const gestiones = useQuery({
    queryKey: [...clave, 'gestiones'],
    queryFn: () => carteraApi.gestiones(),
    enabled: vista === 'gestiones',
  });
  const compromisos = useQuery({
    queryKey: [...clave, 'compromisos'],
    queryFn: () => carteraApi.compromisos(),
    enabled: vista === 'gestiones',
  });
  const ajustes = useQuery({
    queryKey: [...clave, 'ajustes'],
    queryFn: () => carteraApi.ajustes(),
  });
  const unidades =
    useQuery({
      queryKey: [...clave, 'cat-unidades'],
      queryFn: () => propietariosApi.listarUnidades('', 'activas'),
    }).data ?? [];
  const propietarios =
    useQuery({
      queryKey: [...clave, 'cat-propietarios'],
      queryFn: () => propietariosApi.listarPropietarios('', 'activos'),
    }).data ?? [];

  const r = lista.data?.resumen;
  const hayFiltros = Object.values(f).some(Boolean) || !!estadoObl || !!concepto;
  const cambiar = (parcial: Partial<typeof VACIOS>) => setF((x) => ({ ...x, ...parcial }));
  const recargar = () => consulta.invalidateQueries({ queryKey: clave });
  const guardado = (texto: string) => {
    setAviso({ tono: 'ok', texto });
    setGestionDe(null);
    setAjusteDe(null);
    setDialogo(null);
    void recargar();
  };
  const pendientes = (ajustes.data ?? []).filter((a) => a.estado === 'PENDIENTE').length;

  async function exportar(tipo: TipoReporte, formato: 'xlsx' | 'pdf', unidadId?: string) {
    setAviso(null);
    try {
      const filtros = tipo === 'estado-cuenta' || unidadId ? { corte, unidadId } : filtrosUnidad;
      const blob = await carteraApi.reporte(tipo, formato, filtros);
      descargar(
        `${tipo === 'estado-cuenta' ? 'estado-cuenta' : tipo === 'general' ? 'cartera-general' : tipo === 'vencida' ? 'cartera-vencida' : 'gestiones-cobro'}-${corte}.${formato}`,
        blob,
        blob.type,
      );
      setAviso({
        tono: 'ok',
        texto: 'Reporte generado. La exportación quedó registrada en la auditoría.',
      });
    } catch (e) {
      setAviso({ tono: 'error', texto: mensajeDe(e) });
    }
  }

  const filtros = (
    <Card className="mb-3">
      <Card.Body>
        <div className="row g-3 align-items-end">
          <div className="col-12 col-lg-4">
            <Form.Group controlId="cartera-buscar">
              <Form.Label>Buscar</Form.Label>
              <Form.Control
                type="search"
                value={f.buscar}
                onChange={(e) => cambiar({ buscar: e.target.value })}
                placeholder="Propietario, villa o lote"
              />
            </Form.Group>
          </div>
          <div className="col-6 col-lg-4">
            <Form.Group controlId="cartera-unidad">
              <Form.Label>Villa o lote</Form.Label>
              <Form.Select
                value={f.unidadId}
                onChange={(e) => cambiar({ unidadId: e.target.value })}
              >
                <option value="">Todas</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {nombreUnidad(u)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>
          <div className="col-6 col-lg-4">
            <Form.Group controlId="cartera-propietario">
              <Form.Label>Propietario</Form.Label>
              <Form.Select
                value={f.propietarioId}
                onChange={(e) => cambiar({ propietarioId: e.target.value })}
              >
                <option value="">Todos</option>
                {propietarios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>
          <div className="col-6 col-lg-2">
            <Form.Group controlId="cartera-estado">
              <Form.Label>Estado</Form.Label>
              {vista === 'obligaciones' ? (
                <Form.Select value={estadoObl} onChange={(e) => setEstadoObl(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="PARCIAL">Pago parcial</option>
                  <option value="VENCIDA">Vencida</option>
                  <option value="PAGADA">Pagada</option>
                </Form.Select>
              ) : (
                <Form.Select value={f.estado} onChange={(e) => cambiar({ estado: e.target.value })}>
                  <option value="">Todos</option>
                  <option value="CON_SALDO">Con saldo</option>
                  <option value="VENCIDA">Vencida</option>
                  <option value="CORRIENTE">Corriente</option>
                  <option value="AL_DIA">Al día</option>
                </Form.Select>
              )}
            </Form.Group>
          </div>
          {vista === 'obligaciones' && (
            <div className="col-6 col-lg-2">
              <Form.Group controlId="cartera-concepto">
                <Form.Label>Concepto</Form.Label>
                <Form.Select value={concepto} onChange={(e) => setConcepto(e.target.value)}>
                  <option value="">Todos</option>
                  {CONCEPTOS.filter(([c]) => c !== 'CUOTA_VENCIDA').map(([c, n]) => (
                    <option key={c} value={c}>
                      {n}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
          )}
          <div className="col-6 col-lg-2">
            <Form.Group controlId="cartera-desde">
              <Form.Label>Periodo desde</Form.Label>
              <Form.Control
                type="month"
                value={f.periodoDesde}
                max={f.periodoHasta || undefined}
                onChange={(e) => cambiar({ periodoDesde: e.target.value })}
              />
            </Form.Group>
          </div>
          <div className="col-6 col-lg-2">
            <Form.Group controlId="cartera-hasta">
              <Form.Label>Periodo hasta</Form.Label>
              <Form.Control
                type="month"
                value={f.periodoHasta}
                min={f.periodoDesde || undefined}
                onChange={(e) => cambiar({ periodoHasta: e.target.value })}
              />
            </Form.Group>
          </div>
          <div className="col-6 col-lg-2">
            <Form.Group controlId="cartera-minimo">
              <Form.Label>Deuda desde</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="1000"
                inputMode="numeric"
                value={f.minimo}
                onChange={(e) => cambiar({ minimo: e.target.value })}
                placeholder="0"
              />
            </Form.Group>
          </div>
          <div className="col-6 col-lg-2">
            <Form.Group controlId="cartera-maximo">
              <Form.Label>Deuda hasta</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="1000"
                inputMode="numeric"
                value={f.maximo}
                onChange={(e) => cambiar({ maximo: e.target.value })}
                placeholder="Sin límite"
              />
            </Form.Group>
          </div>
          <div className="col-12 col-lg d-flex justify-content-lg-end">
            <Button
              variant="outline-secondary"
              disabled={!hayFiltros}
              onClick={() => {
                setF(VACIOS);
                setEstadoObl('');
                setConcepto('');
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        </div>
      </Card.Body>
    </Card>
  );

  return (
    <>
      <PageHeader
        titulo="Gestión de cartera"
        descripcion={`Obligaciones, saldos y cobro por villa o lote de ${condominioActivo?.razonSocial ?? 'la copropiedad'}.`}
        acciones={
          <div className="d-flex flex-wrap align-items-end gap-2">
            <Form.Group controlId="cartera-corte">
              <Form.Label className="small mb-1">Fecha de corte</Form.Label>
              <Form.Control
                type="date"
                value={corte}
                max={hoy()}
                onChange={(e) => e.target.value && setCorte(e.target.value)}
              />
            </Form.Group>
            {permisos.crear && (
              <Boton
                onClick={() => {
                  setAviso(null);
                  setGestionDe('');
                }}
              >
                <i className="bi bi-telephone" aria-hidden="true" /> Registrar gestión
              </Boton>
            )}
          </div>
        }
      />
      {aviso && (
        <Alerta tono={aviso.tono} className="mb-3">
          {aviso.texto}
        </Alerta>
      )}
      {lista.isError && (
        <Alerta tono="error" className="mb-3">
          {mensajeDe(lista.error)}{' '}
          <button
            type="button"
            className="btn btn-link p-0 align-baseline"
            onClick={() => void lista.refetch()}
          >
            Reintentar
          </button>
        </Alerta>
      )}

      <div className="row row-cols-1 row-cols-sm-2 row-cols-xl-4 g-3 mb-3">
        <div className="col">
          <KpiCard
            etiqueta="Cartera total"
            valor={r ? dinero(r.total) : '—'}
            icono="bi-bank"
            detalle={r ? `Saldo a favor de unidades: ${dinero(r.saldoAFavor)}` : undefined}
          />
        </div>
        <div className="col">
          <KpiCard
            etiqueta="Cartera vencida"
            valor={r ? dinero(r.vencido) : '—'}
            icono="bi-exclamation-triangle"
            detalle={r ? `${r.unidadesVencidas} unidades en mora` : undefined}
          />
        </div>
        <div className="col">
          <KpiCard
            etiqueta="Unidades con saldo"
            valor={r?.unidadesConSaldo ?? '—'}
            icono="bi-houses"
            detalle={r ? `${r.obligacionesAbiertas} obligaciones abiertas` : undefined}
          />
        </div>
        <div className="col">
          <KpiCard
            etiqueta="Compromisos abiertos"
            valor={r?.compromisosAbiertos ?? '—'}
            icono="bi-calendar-check"
            detalle={`Corte al ${fecha(corte)}`}
          />
        </div>
      </div>

      <Nav
        variant="pills"
        activeKey={vista}
        onSelect={(k) => k && setVista(k as Vista)}
        className="mb-3"
        aria-label="Secciones de cartera"
      >
        <Nav.Item>
          <Nav.Link eventKey="resumen">Resumen por unidad</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="obligaciones">Obligaciones</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="gestiones">Gestiones y compromisos</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="ajustes">Ajustes{pendientes ? ` (${pendientes})` : ''}</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="reportes">Importación y reportes</Nav.Link>
        </Nav.Item>
      </Nav>

      {vista === 'resumen' && (
        <>
          {r && <Antiguedad porTramo={r.porTramo} />}
          {filtros}
          <Card>
            {lista.isPending ? (
              <Card.Body>
                <div role="status">Cargando cartera…</div>
              </Card.Body>
            ) : !lista.data?.unidades.length ? (
              <EstadoVacio icono="bi-search" titulo="Sin resultados">
                No hay obligaciones para los filtros seleccionados.
              </EstadoVacio>
            ) : (
              <Table responsive hover className="align-middle mb-0">
                <caption className="visually-hidden">
                  Cartera por unidad a la fecha de corte
                </caption>
                <thead className="table-light">
                  <tr>
                    <th scope="col" className="ps-4">
                      Unidad
                    </th>
                    <th scope="col">Propietario</th>
                    <th scope="col">Periodo más antiguo</th>
                    <th scope="col" className="text-end">
                      Saldo
                    </th>
                    <th scope="col" className="text-end">
                      Vencido
                    </th>
                    <th scope="col" className="text-end">
                      Saldo a favor
                    </th>
                    <th scope="col">Estado</th>
                    <th scope="col">Seguimiento</th>
                    <th scope="col" className="pe-4">
                      <span className="visually-hidden">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lista.data.unidades.map((u) => (
                    <tr key={u.unidad.id}>
                      <td className="ps-4 fw-semibold text-nowrap">{nombreUnidad(u.unidad)}</td>
                      <td>
                        {u.propietarios.map((p) => p.nombre).join(', ') || (
                          <span className="text-body-secondary">Sin propietario registrado</span>
                        )}
                      </td>
                      <td>{u.periodoMasAntiguo ? nombrePeriodo(u.periodoMasAntiguo) : '—'}</td>
                      <td className="text-end fw-semibold" style={NUM}>
                        {dinero(u.saldo)}
                      </td>
                      <td className="text-end" style={NUM}>
                        {dinero(u.vencido)}
                      </td>
                      <td className="text-end" style={NUM}>
                        {Number(u.saldoAFavor) > 0 ? dinero(u.saldoAFavor) : '—'}
                      </td>
                      <td>
                        <Etiqueta tono={ESTADO_UNIDAD[u.estado].tono}>
                          {ESTADO_UNIDAD[u.estado].texto}
                        </Etiqueta>
                        {u.diasMora > 0 && (
                          <small className="d-block text-body-secondary">
                            {u.diasMora} días de mora
                          </small>
                        )}
                      </td>
                      <td className="small">
                        {u.compromisosAbiertos > 0 && (
                          <span className="d-block">
                            {u.compromisosAbiertos} compromiso{u.compromisosAbiertos > 1 ? 's' : ''}{' '}
                            abierto{u.compromisosAbiertos > 1 ? 's' : ''}
                          </span>
                        )}
                        {u.ultimaGestion ? (
                          `Última gestión ${fecha(u.ultimaGestion)}`
                        ) : (
                          <span className="text-body-secondary">Sin gestiones</span>
                        )}
                      </td>
                      <td className="pe-4 text-end">
                        <Button
                          size="sm"
                          variant="outline-primary"
                          className="text-nowrap"
                          aria-label={`Ver estado de cuenta de ${u.unidad.codigo}`}
                          onClick={() => setCuentaId(u.unidad.id)}
                        >
                          Estado de cuenta
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {vista === 'obligaciones' && (
        <>
          {permisos.editar && (
            <div className="d-flex flex-wrap gap-2 mb-3">
              <Boton variante="secundario" onClick={() => setDialogo('obligacion')}>
                <i className="bi bi-plus-lg" aria-hidden="true" /> Registrar obligación
              </Boton>
              {permisos.aprobar && (
                <Boton variante="secundario" onClick={() => setDialogo('generar')}>
                  <i className="bi bi-calendar-plus" aria-hidden="true" /> Generar cuotas del
                  periodo
                </Boton>
              )}
            </div>
          )}
          {filtros}
          <Card>
            {obligaciones.isPending ? (
              <Card.Body>
                <div role="status">Cargando obligaciones…</div>
              </Card.Body>
            ) : obligaciones.isError ? (
              <Card.Body>
                <Alerta tono="error">{mensajeDe(obligaciones.error)}</Alerta>
              </Card.Body>
            ) : !obligaciones.data.obligaciones.length ? (
              <EstadoVacio icono="bi-inbox" titulo="Sin obligaciones">
                No hay obligaciones para los filtros seleccionados.
              </EstadoVacio>
            ) : (
              <>
                <TablaObligaciones datos={obligaciones.data.obligaciones} alVer={setObligacionId} />
                <Card.Footer className="small text-body-secondary">
                  {obligaciones.data.resumen.obligaciones} obligaciones · saldo{' '}
                  {dinero(obligaciones.data.resumen.total)} · vencido{' '}
                  {dinero(obligaciones.data.resumen.vencido)} · corte{' '}
                  {fecha(obligaciones.data.corte)}
                </Card.Footer>
              </>
            )}
          </Card>
        </>
      )}

      {vista === 'gestiones' && (
        <div className="row g-3">
          <div className="col-12 col-xl-5">
            <Card className="h-100">
              <Card.Header className="fw-semibold">Compromisos de pago</Card.Header>
              {compromisos.isPending ? (
                <Card.Body>
                  <div role="status">Cargando compromisos…</div>
                </Card.Body>
              ) : !compromisos.data?.length ? (
                <EstadoVacio icono="bi-calendar-check" titulo="Sin compromisos">
                  Regístrelos junto con la gestión de cobro.
                </EstadoVacio>
              ) : (
                <ul className="list-group list-group-flush">
                  {compromisos.data.map((k) => (
                    <li key={k.id} className="list-group-item">
                      <div className="d-flex flex-wrap justify-content-between gap-2">
                        <span>
                          <strong>{k.unidad ? nombreUnidad(k.unidad) : ''}</strong> ·{' '}
                          {dinero(k.valor)} para el {fecha(k.fechaPactada)}
                        </span>
                        <Etiqueta tono={k.vencido ? 'error' : COMPROMISO[k.estado].tono}>
                          {k.vencido ? 'Abierto · fecha cumplida' : COMPROMISO[k.estado].texto}
                        </Etiqueta>
                      </div>
                      {k.observaciones && (
                        <small className="d-block text-body-secondary">{k.observaciones}</small>
                      )}
                      {k.estado === 'ABIERTO' && permisos.crear && (
                        <div className="d-flex flex-wrap gap-2 mt-2">
                          {(['CUMPLIDO', 'INCUMPLIDO', 'CANCELADO'] as const).map((estado) => (
                            <Button
                              key={estado}
                              size="sm"
                              variant="outline-secondary"
                              aria-label={`Marcar como ${COMPROMISO[estado].texto.toLowerCase()} el compromiso de ${k.unidad?.codigo ?? ''}`}
                              onClick={() =>
                                void carteraApi
                                  .cambiarCompromiso(k.id, estado)
                                  .then(() =>
                                    guardado(
                                      'Compromiso actualizado. El saldo no cambia hasta aplicar un pago válido.',
                                    ),
                                  )
                                  .catch((e: unknown) =>
                                    setAviso({ tono: 'error', texto: mensajeDe(e) }),
                                  )
                              }
                            >
                              {COMPROMISO[estado].texto}
                            </Button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <div className="col-12 col-xl-7 min-w-0">
            <Card className="h-100">
              <Card.Header className="fw-semibold">Historial de gestiones</Card.Header>
              {gestiones.isPending ? (
                <Card.Body>
                  <div role="status">Cargando gestiones…</div>
                </Card.Body>
              ) : !gestiones.data?.length ? (
                <EstadoVacio
                  icono="bi-telephone"
                  titulo="Aún no hay gestiones de cobro"
                  accion={
                    permisos.crear ? (
                      <Boton onClick={() => setGestionDe('')}>Registrar gestión</Boton>
                    ) : undefined
                  }
                >
                  Registre llamadas, mensajes y visitas con su resultado y la fecha del próximo
                  seguimiento.
                </EstadoVacio>
              ) : (
                <Table responsive className="align-middle mb-0">
                  <caption className="visually-hidden">Gestiones de cobro</caption>
                  <thead className="table-light">
                    <tr>
                      <th scope="col" className="ps-3">
                        Fecha
                      </th>
                      <th scope="col">Unidad</th>
                      <th scope="col">Canal</th>
                      <th scope="col">Resultado</th>
                      <th scope="col">Próximo seguimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gestiones.data.map((g) => (
                      <tr key={g.id}>
                        <td className="ps-3 text-nowrap">{fecha(g.fecha)}</td>
                        <td className="text-nowrap">{g.unidad ? nombreUnidad(g.unidad) : ''}</td>
                        <td>{nombreCanal(g.canal)}</td>
                        <td>
                          {g.resultado}
                          <small className="d-block text-body-secondary">
                            {g.responsable}
                            {g.contacto ? ` · habló con ${g.contacto}` : ''}
                          </small>
                        </td>
                        <td className="text-nowrap">
                          {g.proximaFecha ? (
                            fecha(g.proximaFecha)
                          ) : (
                            <span className="text-body-secondary">Sin fecha</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </div>
      )}

      {vista === 'ajustes' && (
        <Ajustes
          datos={ajustes.data}
          cargando={ajustes.isPending}
          permisos={permisos}
          alResolver={guardado}
          alError={(texto) => setAviso({ tono: 'error', texto })}
          alVer={setObligacionId}
        />
      )}

      {vista === 'reportes' && (
        <div className="row g-3">
          <div className="col-12 col-xl-7 min-w-0">
            {permisos.editar ? (
              <ImportarSaldos permisos={permisos} alImportar={guardado} />
            ) : (
              <Card body>
                <Alerta tono="info">
                  La importación de saldos iniciales la realiza contabilidad o administración.
                </Alerta>
              </Card>
            )}
          </div>
          <div className="col-12 col-xl-5">
            <Card>
              <Card.Header className="fw-semibold">Reportes</Card.Header>
              <Card.Body>
                {!permisos.exportar ? (
                  <Alerta tono="info">No tiene permisos para exportar esta información.</Alerta>
                ) : (
                  <>
                    <p className="small text-body-secondary">
                      Usan la fecha de corte ({fecha(corte)}) y los filtros aplicados en «Resumen
                      por unidad».
                    </p>
                    {(
                      [
                        ['general', 'Cartera general'],
                        ['vencida', 'Cartera vencida'],
                        ['gestiones', 'Gestiones de cobro'],
                      ] as const
                    ).map(([tipo, nombre]) => (
                      <div
                        key={tipo}
                        className="d-flex justify-content-between align-items-center gap-2 border-bottom py-2"
                      >
                        <span>{nombre}</span>
                        <span className="d-flex gap-2">
                          <Button
                            size="sm"
                            variant="outline-primary"
                            aria-label={`Descargar ${nombre} en Excel`}
                            onClick={() => void exportar(tipo, 'xlsx')}
                          >
                            Excel
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            aria-label={`Descargar ${nombre} en PDF`}
                            onClick={() => void exportar(tipo, 'pdf')}
                          >
                            PDF
                          </Button>
                        </span>
                      </div>
                    ))}
                    <p className="small text-body-secondary mt-3 mb-0">
                      El estado de cuenta de una unidad se descarga desde «Estado de cuenta» en el
                      resumen.
                    </p>
                  </>
                )}
              </Card.Body>
            </Card>
          </div>
        </div>
      )}

      {cuentaId && (
        <EstadoCuenta
          unidadId={cuentaId}
          corte={corte}
          clave={clave}
          permisos={permisos}
          alCerrar={() => setCuentaId(null)}
          alVerObligacion={(id) => {
            setCuentaId(null);
            setObligacionId(id);
          }}
          alGestionar={(id) => {
            setCuentaId(null);
            setGestionDe(id);
          }}
          alExportar={exportar}
        />
      )}
      {obligacionId && (
        <DetalleObligacion
          id={obligacionId}
          clave={clave}
          permisos={permisos}
          alCerrar={() => setObligacionId(null)}
          alAjustar={(o) => {
            setObligacionId(null);
            setAjusteDe(o);
          }}
        />
      )}
      {gestionDe !== null && (
        <NuevaGestion
          unidades={unidades}
          unidadId={gestionDe}
          alCerrar={() => setGestionDe(null)}
          alGuardar={guardado}
        />
      )}
      {ajusteDe && (
        <SolicitarAjuste
          obligacion={ajusteDe}
          alCerrar={() => setAjusteDe(null)}
          alGuardar={guardado}
        />
      )}
      {dialogo === 'obligacion' && (
        <NuevaObligacion
          unidades={unidades}
          alCerrar={() => setDialogo(null)}
          alGuardar={guardado}
        />
      )}
      {dialogo === 'generar' && (
        <GenerarCuotas alCerrar={() => setDialogo(null)} alGuardar={guardado} />
      )}
    </>
  );
}

function Ajustes({
  datos,
  cargando,
  permisos,
  alResolver,
  alError,
  alVer,
}: {
  datos?: Ajuste[];
  cargando: boolean;
  permisos: PermisosCartera;
  alResolver: (texto: string) => void;
  alError: (texto: string) => void;
  alVer: (obligacionId: string) => void;
}) {
  const [notas, setNotas] = useState<Record<string, string>>({});
  if (cargando)
    return (
      <Card body>
        <div role="status">Cargando ajustes…</div>
      </Card>
    );
  if (!datos?.length) {
    return (
      <Card>
        <EstadoVacio icono="bi-sliders" titulo="Sin ajustes de cartera">
          Los ajustes se solicitan desde el detalle de una obligación y los autoriza una persona
          distinta.
        </EstadoVacio>
      </Card>
    );
  }
  const resolver = (a: Ajuste, aprobar: boolean) =>
    void carteraApi
      .resolverAjuste(a.id, aprobar, (notas[a.id] ?? '').trim())
      .then(() =>
        alResolver(
          aprobar
            ? 'Ajuste aprobado y aplicado al saldo.'
            : 'Ajuste rechazado. El saldo no cambió.',
        ),
      )
      .catch((e: unknown) => alError(mensajeDe(e)));
  return (
    <Card>
      <ul className="list-group list-group-flush">
        {datos.map((a) => {
          const nota = (notas[a.id] ?? '').trim();
          return (
            <li key={a.id} className="list-group-item py-3">
              <div className="d-flex flex-wrap justify-content-between gap-2">
                <span>
                  <strong>
                    {a.tipo === 'CREDITO' ? 'Crédito' : 'Débito'} por {dinero(a.valor)}
                  </strong>{' '}
                  · {a.unidad ? nombreUnidad(a.unidad) : ''} ·{' '}
                  <button
                    type="button"
                    className="btn btn-link p-0 align-baseline"
                    onClick={() => alVer(a.obligacionId)}
                  >
                    {a.obligacion?.numeroVisible}
                  </button>{' '}
                  (
                  {a.obligacion
                    ? `${nombreConcepto(a.obligacion.concepto)} ${nombrePeriodo(a.obligacion.periodo)}`
                    : ''}
                  )
                </span>
                <Etiqueta tono={AJUSTE[a.estado].tono}>{AJUSTE[a.estado].texto}</Etiqueta>
              </div>
              <p className="mb-1 mt-1">
                {a.motivo}
                {a.soporte ? ` · Soporte: ${a.soporte}` : ''}
              </p>
              <small className="text-body-secondary">
                Solicitó {a.solicitadoPorNombre} el {fechaHora(a.createdAt)}
                {a.resueltoEn
                  ? ` · Resolvió ${a.resueltoPorNombre} el ${fechaHora(a.resueltoEn)}: ${a.notaResolucion}`
                  : ''}
              </small>
              {a.estado === 'PENDIENTE' &&
                permisos.aprobar &&
                (a.esPropio ? (
                  <p className="small text-body-secondary mb-0 mt-2">
                    Usted lo solicitó: debe autorizarlo otra persona.
                  </p>
                ) : (
                  <div className="d-flex flex-wrap align-items-end gap-2 mt-2">
                    <Form.Group
                      controlId={`nota-${a.id}`}
                      className="flex-grow-1"
                      style={{ minWidth: '14rem' }}
                    >
                      <Form.Label className="small mb-1">Nota de autorización *</Form.Label>
                      <Form.Control
                        size="sm"
                        maxLength={1000}
                        value={notas[a.id] ?? ''}
                        onChange={(e) => setNotas({ ...notas, [a.id]: e.target.value })}
                      />
                    </Form.Group>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={nota.length < 5}
                      onClick={() => resolver(a, true)}
                    >
                      Aprobar ajuste
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={nota.length < 5}
                      onClick={() => resolver(a, false)}
                    >
                      Rechazar
                    </Button>
                  </div>
                ))}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const RESULTADO: Record<
  ResultadoFilaSaldo,
  { texto: string; tono: 'ok' | 'aviso' | 'error' | 'info' }
> = {
  VALIDA: { texto: 'Válida', tono: 'ok' },
  ADVERTENCIA: { texto: 'Revisar', tono: 'aviso' },
  DUPLICADO: { texto: 'Duplicada', tono: 'info' },
  ERROR: { texto: 'Con error', tono: 'error' },
};

function ImportarSaldos({
  permisos,
  alImportar,
}: {
  permisos: PermisosCartera;
  alImportar: (texto: string) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fechaCorte, setFechaCorte] = useState(hoy());
  const [vista, setVista] = useState<VistaSaldos | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function con<T>(accion: () => Promise<T>) {
    setError('');
    setOcupado(true);
    try {
      return await accion();
    } catch (e) {
      setError(mensajeDe(e));
      return undefined;
    } finally {
      setOcupado(false);
    }
  }
  const importables = vista ? vista.resumen.validas + vista.resumen.advertencias : 0;
  return (
    <Card>
      <Card.Header className="fw-semibold">Importar saldos iniciales</Card.Header>
      <Card.Body>
        {error && (
          <Alerta tono="error" className="mb-3">
            {error}
          </Alerta>
        )}
        {!vista ? (
          <>
            <p className="small text-body-secondary">
              Archivo Excel o CSV con las columnas <strong>unidad</strong>, <strong>periodo</strong>{' '}
              (AAAA-MM), <strong>vencimiento</strong> y <strong>valor</strong>; opcional,
              descripción. Nada se crea hasta aprobar.
            </p>
            <div className="row g-3 align-items-end">
              <div className="col-md-6">
                <Form.Group controlId="saldos-archivo">
                  <Form.Label>Archivo de saldos</Form.Label>
                  <Form.Control
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setArchivo((e.target as HTMLInputElement).files?.[0] ?? null)}
                  />
                </Form.Group>
              </div>
              <div className="col-md-3">
                <Form.Group controlId="saldos-corte">
                  <Form.Label>Fecha de corte</Form.Label>
                  <Form.Control
                    type="date"
                    max={hoy()}
                    value={fechaCorte}
                    onChange={(e) => setFechaCorte(e.target.value)}
                  />
                </Form.Group>
              </div>
              <div className="col-md-3">
                <Boton
                  className="w-100"
                  cargando={ocupado}
                  disabled={!archivo || !fechaCorte}
                  onClick={() =>
                    void con(() => carteraApi.previsualizarSaldos(archivo!, fechaCorte)).then(
                      (v) => v && setVista(v),
                    )
                  }
                >
                  Validar archivo
                </Boton>
              </div>
            </div>
            <a
              className="btn btn-outline-primary btn-sm mt-3"
              href={`${import.meta.env.BASE_URL}plantilla-saldos-iniciales.xlsx`}
              download
            >
              <i className="bi bi-download me-1" aria-hidden="true" />
              Descargar plantilla
            </a>
          </>
        ) : (
          <>
            <p>
              <strong>{vista.archivo}</strong> · corte {fecha(vista.fechaCorte)} ·{' '}
              {vista.resumen.validas} válidas, {vista.resumen.advertencias} por revisar,{' '}
              {vista.resumen.duplicados} duplicadas, {vista.resumen.errores} con error · a importar{' '}
              <strong>{dinero(vista.resumen.valor)}</strong>
            </p>
            {vista.resumen.advertencias > 0 && (
              <Alerta tono="aviso" className="mb-3">
                Hay unidades que ya tienen obligaciones registradas. Revise que el saldo importado
                no duplique la deuda antes de confirmar.
              </Alerta>
            )}
            <div className="table-responsive mb-3" style={{ maxHeight: '40vh' }}>
              <Table size="sm" className="align-middle">
                <caption className="visually-hidden">Resultado de la validación por fila</caption>
                <thead className="table-light">
                  <tr>
                    <th scope="col">Fila</th>
                    <th scope="col">Resultado</th>
                    <th scope="col">Unidad</th>
                    <th scope="col">Periodo</th>
                    <th scope="col">Vencimiento</th>
                    <th scope="col" className="text-end">
                      Valor
                    </th>
                    <th scope="col">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.filas.map((x) => (
                    <tr key={x.fila}>
                      <td>{x.fila}</td>
                      <td>
                        <Etiqueta tono={RESULTADO[x.resultado].tono}>
                          {RESULTADO[x.resultado].texto}
                        </Etiqueta>
                      </td>
                      <td>{x.unidad || '—'}</td>
                      <td>{x.periodo ?? '—'}</td>
                      <td>{fecha(x.fechaVencimiento)}</td>
                      <td className="text-end">{dinero(x.valor)}</td>
                      <td>{x.mensajes.join('; ') || 'Sin novedades'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="d-flex flex-wrap gap-2">
              {permisos.aprobar ? (
                <Boton
                  cargando={ocupado}
                  disabled={importables === 0}
                  onClick={() =>
                    void con(() => carteraApi.aprobarSaldos(vista.id)).then(
                      (x) =>
                        x &&
                        (setVista(null),
                        setArchivo(null),
                        alImportar(
                          `Se importaron ${x.creadas} saldos iniciales por ${dinero(x.valor)}.${x.omitidas ? ` ${x.omitidas} filas no se importaron.` : ''}`,
                        )),
                    )
                  }
                >
                  {importables === 0
                    ? 'No hay filas para importar'
                    : `Aprobar e importar ${importables} saldos`}
                </Boton>
              ) : (
                <span className="small text-body-secondary align-self-center">
                  La aprobación la realiza un usuario autorizado.
                </span>
              )}
              <Button
                variant="outline-secondary"
                disabled={ocupado}
                onClick={() =>
                  void con(() => carteraApi.descartarSaldos(vista.id)).then(() => setVista(null))
                }
              >
                Descartar
              </Button>
            </div>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
