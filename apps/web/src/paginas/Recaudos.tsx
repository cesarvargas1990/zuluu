import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { permisosPorDefecto } from '@zulu/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Nav from 'react-bootstrap/Nav';
import Table from 'react-bootstrap/Table';
import { propietariosApi } from '@/api/propietarios';
import {
  recaudosApi,
  type EstadoRecaudo,
  type FiltrosRecaudos,
  type MedioPago,
  type RecaudoListado,
} from '@/api/recaudos';
import { EstadoVacio } from '@/componentes/dashboard/EstadoVacio';
import { KpiCard } from '@/componentes/dashboard/KpiCard';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { Alerta, Boton, Etiqueta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { useSesion } from '@/sesion/SesionProvider';
import { DetallePago, type PermisosRecaudos } from './recaudos/DetallePago';
import { FormularioPago } from './recaudos/FormularioPago';
import { ImportarPagos } from './recaudos/ImportarPagos';
import {
  ESTADOS,
  MEDIOS,
  csvDeRecaudos,
  descargar,
  dinero,
  fecha,
  hoy,
  nombreEstado,
  nombreMedio,
  tonoEstado,
} from './recaudos/formato';

type Vista = 'movimientos' | 'revision';
const FILTROS_VACIOS = {
  buscar: '',
  estado: '' as EstadoRecaudo | '',
  medio: '' as MedioPago | '',
  unidadId: '',
  propietarioId: '',
  desde: '',
  hasta: '',
};
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error inesperado.');

export function Recaudos() {
  useTitulo('Pagos y recaudos');
  const { condominioActivo } = useSesion();
  const consulta = useQueryClient();
  const permisos = useMemo<PermisosRecaudos>(() => {
    const acciones = condominioActivo ? permisosPorDefecto(condominioActivo.rol, '02') : [];
    return {
      crear: acciones.includes('crear'),
      editar: acciones.includes('editar'),
      aprobar: acciones.includes('aprobar'),
      exportar: acciones.includes('exportar'),
    };
  }, [condominioActivo]);

  const [vista, setVista] = useState<Vista>('movimientos');
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  // La búsqueda por texto espera a que la persona termine de escribir.
  const [buscar, setBuscar] = useState('');
  useEffect(() => {
    const espera = setTimeout(() => setBuscar(filtros.buscar.trim()), 300);
    return () => clearTimeout(espera);
  }, [filtros.buscar]);
  const [registrando, setRegistrando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'aviso' | 'error'; texto: string } | null>(
    null,
  );
  const [exportando, setExportando] = useState(false);

  const clave = ['req003', condominioActivo?.condominioId] as const;
  const consultaApi: FiltrosRecaudos = { ...filtros, buscar };
  const lista = useQuery({
    queryKey: [...clave, 'lista', 'movimientos', consultaApi],
    queryFn: () => recaudosApi.listar(consultaApi),
    placeholderData: keepPreviousData,
  });
  const revision = useQuery({
    queryKey: [...clave, 'lista', 'revision'],
    queryFn: () => recaudosApi.listar({ bandeja: 'revision' }),
  });
  const unidadesQuery = useQuery({
    queryKey: [...clave, 'unidades'],
    queryFn: () => propietariosApi.listarUnidades('', 'activas'),
  });
  const propietariosQuery = useQuery({
    queryKey: [...clave, 'propietarios'],
    queryFn: () => propietariosApi.listarPropietarios('', 'activos'),
  });
  const unidades = unidadesQuery.data ?? [];
  const propietarios = propietariosQuery.data ?? [];

  const resumen = lista.data?.resumen;
  const hayFiltros = Object.values(filtros).some(Boolean);
  const cambiar = (parcial: Partial<typeof FILTROS_VACIOS>) =>
    setFiltros((f) => ({ ...f, ...parcial }));
  const recargar = () => consulta.invalidateQueries({ queryKey: [...clave, 'lista'] });

  async function exportar() {
    setAviso(null);
    setExportando(true);
    try {
      const { items } = await recaudosApi.exportar(consultaApi);
      if (items.length === 0) {
        setAviso({ tono: 'aviso', texto: 'No hay pagos para exportar con los filtros actuales.' });
        return;
      }
      descargar(`recaudos-${hoy()}.csv`, csvDeRecaudos(items), 'text/csv;charset=utf-8');
      setAviso({
        tono: 'ok',
        texto: `Se exportaron ${items.length} pagos. La exportación quedó registrada en la auditoría.`,
      });
    } catch (e) {
      setAviso({ tono: 'error', texto: mensajeDe(e) });
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Pagos y recaudos"
        descripcion={`Registro, consulta y verificación de pagos por villa o lote de ${condominioActivo?.razonSocial ?? 'la copropiedad'}.`}
        acciones={
          <div className="d-flex flex-wrap gap-2">
            {permisos.exportar && (
              <Boton variante="secundario" cargando={exportando} onClick={() => void exportar()}>
                <i className="bi bi-download" aria-hidden="true" /> Exportar
              </Boton>
            )}
            {permisos.crear && (
              <>
                <Boton
                  variante="secundario"
                  onClick={() => {
                    setAviso(null);
                    setImportando(true);
                  }}
                >
                  <i className="bi bi-file-earmark-spreadsheet" aria-hidden="true" /> Importar Excel
                </Boton>
                <Boton
                  onClick={() => {
                    setAviso(null);
                    setRegistrando(true);
                  }}
                >
                  <i className="bi bi-plus-lg" aria-hidden="true" /> Registrar pago
                </Boton>
              </>
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
            etiqueta="Pagos registrados"
            valor={resumen?.total ?? '—'}
            icono="bi-receipt"
            detalle={hayFiltros ? 'Según los filtros aplicados' : 'Todos los movimientos'}
          />
        </div>
        <div className="col">
          <KpiCard
            etiqueta="Valor recibido"
            valor={resumen ? dinero(resumen.valorRecibido) : '—'}
            icono="bi-cash-coin"
            detalle={
              resumen
                ? `Verificado: ${dinero(resumen.valorVerificado)} · saldo a favor: ${dinero(resumen.saldoAFavor)}`
                : undefined
            }
          />
        </div>
        <div className="col">
          <KpiCard
            etiqueta="Pendientes de verificar"
            valor={resumen?.pendientes ?? '—'}
            icono="bi-hourglass-split"
            detalle={resumen ? `${resumen.observados} observados` : undefined}
          />
        </div>
        <div className="col">
          <KpiCard
            etiqueta="Sin identificar"
            valor={resumen?.sinIdentificar ?? '—'}
            icono="bi-question-circle"
            detalle="Sin villa o lote asignado"
          />
        </div>
      </div>

      <Nav
        variant="pills"
        activeKey={vista}
        onSelect={(k) => k && setVista(k as Vista)}
        className="mb-3"
        aria-label="Secciones de pagos"
      >
        <Nav.Item>
          <Nav.Link eventKey="movimientos">Movimientos</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="revision">
            Por identificar y observados{revision.data ? ` (${revision.data.items.length})` : ''}
          </Nav.Link>
        </Nav.Item>
      </Nav>

      {vista === 'movimientos' && (
        <>
          <Card className="mb-3">
            <Card.Body>
              <div className="row g-3 align-items-end">
                <div className="col-12 col-lg-4">
                  <Form.Group controlId="filtro-buscar">
                    <Form.Label>Buscar</Form.Label>
                    <Form.Control
                      type="search"
                      value={filtros.buscar}
                      onChange={(e) => cambiar({ buscar: e.target.value })}
                      placeholder="Registro, referencia, pagador, unidad…"
                    />
                  </Form.Group>
                </div>
                <div className="col-6 col-lg-2">
                  <Form.Group controlId="filtro-estado">
                    <Form.Label>Estado</Form.Label>
                    <Form.Select
                      value={filtros.estado}
                      onChange={(e) => cambiar({ estado: e.target.value as EstadoRecaudo | '' })}
                    >
                      <option value="">Todos</option>
                      {ESTADOS.map(([codigo, nombre]) => (
                        <option key={codigo} value={codigo}>
                          {nombre}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>
                <div className="col-6 col-lg-2">
                  <Form.Group controlId="filtro-medio">
                    <Form.Label>Medio de pago</Form.Label>
                    <Form.Select
                      value={filtros.medio}
                      onChange={(e) => cambiar({ medio: e.target.value as MedioPago | '' })}
                    >
                      <option value="">Todos</option>
                      {MEDIOS.map(([codigo, nombre]) => (
                        <option key={codigo} value={codigo}>
                          {nombre}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>
                <div className="col-6 col-lg-2">
                  <Form.Group controlId="filtro-desde">
                    <Form.Label>Desde</Form.Label>
                    <Form.Control
                      type="date"
                      value={filtros.desde}
                      max={filtros.hasta || undefined}
                      onChange={(e) => cambiar({ desde: e.target.value })}
                    />
                  </Form.Group>
                </div>
                <div className="col-6 col-lg-2">
                  <Form.Group controlId="filtro-hasta">
                    <Form.Label>Hasta</Form.Label>
                    <Form.Control
                      type="date"
                      value={filtros.hasta}
                      min={filtros.desde || undefined}
                      onChange={(e) => cambiar({ hasta: e.target.value })}
                    />
                  </Form.Group>
                </div>
                <div className="col-6 col-lg-4">
                  <Form.Group controlId="filtro-unidad">
                    <Form.Label>Villa o lote</Form.Label>
                    <Form.Select
                      value={filtros.unidadId}
                      onChange={(e) => cambiar({ unidadId: e.target.value })}
                    >
                      <option value="">Todas</option>
                      {unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.tipo === 'VILLA' ? 'Villa' : 'Lote'} · {u.codigo}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>
                <div className="col-6 col-lg-4">
                  <Form.Group controlId="filtro-propietario">
                    <Form.Label>Propietario</Form.Label>
                    <Form.Select
                      value={filtros.propietarioId}
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
                <div className="col-12 col-lg-4 d-flex justify-content-lg-end">
                  <Button
                    variant="outline-secondary"
                    disabled={!hayFiltros}
                    onClick={() => setFiltros(FILTROS_VACIOS)}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              </div>
            </Card.Body>
          </Card>
          <TablaMovimientos
            datos={lista.data?.items}
            total={resumen?.total ?? 0}
            cargando={lista.isPending}
            hayFiltros={hayFiltros}
            alVer={setDetalleId}
            accionVacia={
              permisos.crear ? (
                <Boton onClick={() => setRegistrando(true)}>Registrar pago</Boton>
              ) : undefined
            }
          />
        </>
      )}

      {vista === 'revision' && (
        <TablaRevision
          datos={revision.data?.items}
          cargando={revision.isPending}
          error={revision.isError ? mensajeDe(revision.error) : ''}
          alVer={setDetalleId}
        />
      )}

      {registrando && (
        <FormularioPago
          unidades={unidades}
          propietarios={propietarios}
          alCerrar={() => setRegistrando(false)}
          alRegistrar={(nuevo) => {
            setRegistrando(false);
            setAviso(nuevo);
            void recargar();
          }}
        />
      )}
      {importando && (
        <ImportarPagos
          alCerrar={() => setImportando(false)}
          alImportar={(texto) => {
            setImportando(false);
            setAviso({ tono: 'ok', texto });
            void recargar();
          }}
        />
      )}
      {detalleId && (
        <DetallePago
          id={detalleId}
          clave={clave}
          permisos={permisos}
          unidades={unidades}
          alCerrar={() => setDetalleId(null)}
        />
      )}
    </>
  );
}

const unidadDe = (r: RecaudoListado) =>
  r.unidad ? `${r.unidad.tipo === 'VILLA' ? 'Villa' : 'Lote'} · ${r.unidad.codigo}` : null;

function TablaMovimientos({
  datos,
  total,
  cargando,
  hayFiltros,
  alVer,
  accionVacia,
}: {
  datos?: RecaudoListado[];
  total: number;
  cargando: boolean;
  hayFiltros: boolean;
  alVer: (id: string) => void;
  accionVacia?: ReactNode;
}) {
  if (cargando)
    return (
      <Card body>
        <div role="status">Cargando pagos…</div>
      </Card>
    );
  if (!datos) return null;
  if (datos.length === 0) {
    return (
      <Card>
        {hayFiltros ? (
          <EstadoVacio icono="bi-search" titulo="Ningún pago coincide con los filtros">
            Cambie o limpie los filtros para ver más movimientos.
          </EstadoVacio>
        ) : (
          <EstadoVacio
            icono="bi-receipt"
            titulo="Aún no hay pagos registrados"
            accion={accionVacia}
          >
            Registre el primer pago con su comprobante o impórtelos desde un archivo de Excel.
          </EstadoVacio>
        )}
      </Card>
    );
  }
  return (
    <Card>
      <Table responsive hover className="align-middle mb-0">
        <caption className="visually-hidden">Movimientos de recaudo</caption>
        <thead className="table-light">
          <tr>
            <th scope="col" className="ps-4">
              Registro
            </th>
            <th scope="col">Fecha de pago</th>
            <th scope="col">Unidad</th>
            <th scope="col">Propietario / pagador</th>
            <th scope="col">Medio</th>
            <th scope="col">Referencia</th>
            <th scope="col" className="text-end">
              Valor
            </th>
            <th scope="col">Estado</th>
            <th scope="col" className="pe-4">
              <span className="visually-hidden">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {datos.map((r) => (
            <tr key={r.id}>
              <td className="ps-4 fw-semibold text-nowrap">
                {r.numeroVisible}
                {r._count.soportes > 0 && (
                  <i
                    className="bi bi-paperclip ms-1 text-body-secondary"
                    role="img"
                    aria-label="Con comprobante"
                  />
                )}
              </td>
              <td className="text-nowrap">{fecha(r.fechaPago)}</td>
              <td>{unidadDe(r) ?? <Etiqueta tono="aviso">Sin identificar</Etiqueta>}</td>
              <td>
                {r.propietario?.nombre ?? r.pagador ?? (
                  <span className="text-body-secondary">No registrado</span>
                )}
                {r.propietario && r.pagador && (
                  <small className="d-block text-body-secondary">Pagó: {r.pagador}</small>
                )}
              </td>
              <td>{nombreMedio(r.medio)}</td>
              <td>{r.referencia ?? <span className="text-body-secondary">Sin referencia</span>}</td>
              <td
                className="text-end fw-semibold text-nowrap"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {dinero(r.valor)}
              </td>
              <td>
                <Etiqueta tono={tonoEstado(r.estado)}>{nombreEstado(r.estado)}</Etiqueta>
                {r.posibleDuplicado && r.estado !== 'ANULADO' && (
                  <small className="d-block text-body-secondary">Posible duplicado</small>
                )}
              </td>
              <td className="pe-4 text-end">
                <Button
                  size="sm"
                  variant="outline-primary"
                  className="text-nowrap"
                  aria-label={`Ver detalle de ${r.numeroVisible}`}
                  onClick={() => alVer(r.id)}
                >
                  Ver detalle
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Card.Footer className="small text-body-secondary">
        Mostrando {datos.length} de {total} movimientos
        {total > datos.length ? '. Use los filtros para acotar la consulta.' : ''}
      </Card.Footer>
    </Card>
  );
}

function TablaRevision({
  datos,
  cargando,
  error,
  alVer,
}: {
  datos?: RecaudoListado[];
  cargando: boolean;
  error: string;
  alVer: (id: string) => void;
}) {
  if (cargando)
    return (
      <Card body>
        <div role="status">Cargando bandeja…</div>
      </Card>
    );
  if (error) return <Alerta tono="error">{error}</Alerta>;
  if (!datos?.length) {
    return (
      <Card>
        <EstadoVacio icono="bi-check2-circle" titulo="No hay pagos por revisar">
          Aquí aparecen los pagos sin villa o lote asignado y los que quedaron observados.
        </EstadoVacio>
      </Card>
    );
  }
  return (
    <Card>
      <Table responsive hover className="align-middle mb-0">
        <caption className="visually-hidden">Pagos por identificar y observados</caption>
        <thead className="table-light">
          <tr>
            <th scope="col" className="ps-4">
              Registro
            </th>
            <th scope="col">Fecha de pago</th>
            <th scope="col">Referencia</th>
            <th scope="col">Pagador</th>
            <th scope="col" className="text-end">
              Valor
            </th>
            <th scope="col">Motivo</th>
            <th scope="col" className="pe-4">
              <span className="visually-hidden">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {datos.map((r) => (
            <tr key={r.id}>
              <td className="ps-4 fw-semibold">{r.numeroVisible}</td>
              <td>{fecha(r.fechaPago)}</td>
              <td>{r.referencia ?? <span className="text-body-secondary">Sin referencia</span>}</td>
              <td>{r.pagador ?? <span className="text-body-secondary">No registrado</span>}</td>
              <td className="text-end fw-semibold text-nowrap">{dinero(r.valor)}</td>
              <td>
                {!r.unidadId && <Etiqueta tono="aviso">Unidad no identificada</Etiqueta>}{' '}
                {r.estado === 'OBSERVADO' && <Etiqueta tono="error">Observado</Etiqueta>}
                {r.observacionVerificacion && (
                  <small className="d-block text-body-secondary">{r.observacionVerificacion}</small>
                )}
              </td>
              <td className="pe-4 text-end">
                <Button
                  size="sm"
                  variant="outline-primary"
                  className="text-nowrap"
                  aria-label={`Revisar ${r.numeroVisible}`}
                  onClick={() => alVer(r.id)}
                >
                  Revisar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
