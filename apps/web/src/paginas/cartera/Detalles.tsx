import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Nav from 'react-bootstrap/Nav';
import Table from 'react-bootstrap/Table';
import { carteraApi, type Movimiento, type Obligacion, type TipoReporte } from '@/api/cartera';
import { Alerta, Boton, Etiqueta } from '@/componentes/ui';
import {
  dinero,
  fecha,
  fechaHora,
  nombreConcepto,
  nombreEstado,
  nombrePeriodo,
} from '../recaudos/formato';
import type { PermisosCartera } from './Dialogos';
import {
  AJUSTE,
  COMPROMISO,
  MOVIMIENTO,
  TRAMOS,
  estadoObligacion,
  mensajeDe,
  nombreAccion,
  nombreCanal,
  nombreUnidad,
  sinAnimacion,
} from './textos';

const NUM = { fontVariantNumeric: 'tabular-nums' } as const;

function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="col">
      <div className="border rounded p-3 h-100">
        <p className="small text-body-secondary mb-1">{etiqueta}</p>
        <p className="h5 mb-0" style={NUM}>
          {dinero(valor)}
        </p>
        {nota && <p className="small text-body-secondary mb-0 mt-1">{nota}</p>}
      </div>
    </div>
  );
}

export function TablaMovimientos({
  movimientos,
  conObligacion = true,
}: {
  movimientos: Movimiento[];
  conObligacion?: boolean;
}) {
  if (movimientos.length === 0)
    return <p className="text-body-secondary">Sin movimientos a la fecha de corte.</p>;
  return (
    <div className="table-responsive">
      <Table size="sm" className="align-middle">
        <caption className="visually-hidden">Movimientos de cartera con saldo acumulado</caption>
        <thead className="table-light">
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Movimiento</th>
            {conObligacion && <th scope="col">Obligación</th>}
            <th scope="col" className="text-end">
              Cargo
            </th>
            <th scope="col" className="text-end">
              Abono
            </th>
            <th scope="col" className="text-end">
              Saldo
            </th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id}>
              <td className="text-nowrap">{fecha(m.fecha)}</td>
              <td>
                {MOVIMIENTO[m.tipo]}
                {m.recaudo ? ` ${m.recaudo}` : ''}
                {m.descripcion && m.tipo !== 'CARGO' && m.tipo !== 'PAGO' && (
                  <small className="d-block text-body-secondary">{m.descripcion}</small>
                )}
              </td>
              {conObligacion && (
                <td>
                  {m.obligacion}
                  <small className="d-block text-body-secondary">
                    {nombreConcepto(m.concepto)} · {nombrePeriodo(m.periodo)}
                  </small>
                </td>
              )}
              <td className="text-end" style={NUM}>
                {m.cargo ? dinero(m.cargo) : ''}
              </td>
              <td className="text-end" style={NUM}>
                {m.abono ? dinero(m.abono) : ''}
              </td>
              <td className="text-end fw-semibold" style={NUM}>
                {dinero(m.saldo)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

interface PropsCuenta {
  unidadId: string;
  corte: string;
  clave: readonly unknown[];
  permisos: PermisosCartera;
  alCerrar: () => void;
  alVerObligacion: (id: string) => void;
  alGestionar: (unidadId: string) => void;
  alExportar: (tipo: TipoReporte, formato: 'xlsx' | 'pdf', unidadId: string) => Promise<void>;
}

/** Pantalla B: estado de cuenta de la unidad. */
export function EstadoCuenta({
  unidadId,
  corte,
  clave,
  permisos,
  alCerrar,
  alVerObligacion,
  alGestionar,
  alExportar,
}: PropsCuenta) {
  const q = useQuery({
    queryKey: [...clave, 'cuenta', unidadId, corte],
    queryFn: () => carteraApi.estadoDeCuenta(unidadId, corte),
  });
  const [pestana, setPestana] = useState<'obligaciones' | 'movimientos' | 'gestiones'>(
    'obligaciones',
  );
  const [bajando, setBajando] = useState('');
  const c = q.data;
  const bajar = async (formato: 'xlsx' | 'pdf') => {
    setBajando(formato);
    await alExportar('estado-cuenta', formato, unidadId);
    setBajando('');
  };
  return (
    <Modal
      show
      onHide={alCerrar}
      centered
      size="xl"
      animation={!sinAnimacion}
      aria-labelledby="titulo-cuenta"
    >
      <Modal.Header closeButton>
        <Modal.Title id="titulo-cuenta">
          {c ? `Estado de cuenta · ${nombreUnidad(c.unidad)}` : 'Estado de cuenta'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {q.isPending && <p role="status">Cargando estado de cuenta…</p>}
        {q.isError && <Alerta tono="error">{mensajeDe(q.error)}</Alerta>}
        {c && (
          <>
            <p className="text-body-secondary">
              {c.propietarios.map((p) => p.nombre).join(', ') || 'Sin propietario registrado'} ·
              Fecha de corte {fecha(c.corte)}
            </p>
            <div className="row row-cols-2 row-cols-lg-4 g-3 mb-3">
              <Cifra etiqueta="Obligaciones" valor={c.totales.cargos} />
              <Cifra
                etiqueta="Pagos aplicados"
                valor={c.totales.pagos}
                nota={
                  Number(c.totales.creditos) > 0
                    ? `Ajustes crédito: ${dinero(c.totales.creditos)}`
                    : undefined
                }
              />
              <Cifra
                etiqueta="Saldo pendiente"
                valor={c.totales.saldo}
                nota={`Vencido: ${dinero(c.totales.vencido)}`}
              />
              <Cifra
                etiqueta="Saldo a favor"
                valor={c.totales.saldoAFavor}
                nota="Anticipos sin aplicar"
              />
            </div>
            {c.recaudosSinVerificar.length > 0 && (
              <Alerta tono="aviso" className="mb-3">
                {c.recaudosSinVerificar
                  .map(
                    (r) =>
                      `${r.numeroVisible} por ${dinero(r.valor)} (${nombreEstado(r.estado).toLowerCase()})`,
                  )
                  .join('; ')}
                . Este recaudo no modifica cartera hasta ser verificado.
              </Alerta>
            )}
            <Nav
              variant="tabs"
              activeKey={pestana}
              onSelect={(k) => k && setPestana(k as typeof pestana)}
              className="mb-3"
            >
              <Nav.Item>
                <Nav.Link eventKey="obligaciones">Obligaciones ({c.obligaciones.length})</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="movimientos">Movimientos ({c.movimientos.length})</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="gestiones">
                  Gestiones y compromisos ({c.gestiones.length})
                </Nav.Link>
              </Nav.Item>
            </Nav>
            {pestana === 'obligaciones' &&
              (c.obligaciones.length === 0 ? (
                <p className="text-body-secondary">
                  No hay obligaciones para esta unidad a la fecha de corte.
                </p>
              ) : (
                <TablaObligaciones
                  datos={c.obligaciones}
                  conUnidad={false}
                  alVer={alVerObligacion}
                />
              ))}
            {pestana === 'movimientos' && <TablaMovimientos movimientos={c.movimientos} />}
            {pestana === 'gestiones' && (
              <>
                {c.compromisos.length > 0 && (
                  <>
                    <h2 className="h6">Compromisos de pago</h2>
                    <ul className="list-unstyled mb-3">
                      {c.compromisos.map((k) => (
                        <li key={k.id} className="border-bottom py-2">
                          {fecha(k.fechaPactada)} · <strong>{dinero(k.valor)}</strong> ·{' '}
                          <Etiqueta tono={COMPROMISO[k.estado].tono}>
                            {COMPROMISO[k.estado].texto}
                          </Etiqueta>
                          {k.observaciones && (
                            <small className="d-block text-body-secondary">{k.observaciones}</small>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h2 className="h6">Historial de gestiones</h2>
                {c.gestiones.length === 0 ? (
                  <p className="text-body-secondary">
                    Aún no hay gestiones de cobro registradas para esta unidad.
                  </p>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {c.gestiones.map((g) => (
                      <li key={g.id} className="border-bottom py-2">
                        <strong>{fecha(g.fecha)}</strong> · {nombreCanal(g.canal)}
                        {g.contacto ? ` · ${g.contacto}` : ''} · {g.responsable}
                        <span className="d-block">{g.resultado}</span>
                        {g.proximaFecha && (
                          <small className="text-body-secondary">
                            Próximo seguimiento: {fecha(g.proximaFecha)}
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {c && permisos.crear && (
          <Button
            variant="outline-primary"
            className="me-auto"
            onClick={() => alGestionar(unidadId)}
          >
            <i className="bi bi-telephone me-1" aria-hidden="true" />
            Registrar gestión
          </Button>
        )}
        {c && permisos.exportar && (
          <>
            <Boton
              variante="secundario"
              cargando={bajando === 'xlsx'}
              onClick={() => void bajar('xlsx')}
            >
              Excel
            </Boton>
            <Boton
              variante="secundario"
              cargando={bajando === 'pdf'}
              onClick={() => void bajar('pdf')}
            >
              PDF
            </Boton>
          </>
        )}
        <Button variant="secondary" onClick={alCerrar}>
          Cerrar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export function TablaObligaciones({
  datos,
  conUnidad = true,
  alVer,
}: {
  datos: Obligacion[];
  conUnidad?: boolean;
  alVer: (id: string) => void;
}) {
  return (
    <div className="table-responsive">
      <Table hover className="align-middle mb-0">
        <caption className="visually-hidden">Obligaciones con su saldo y estado</caption>
        <thead className="table-light">
          <tr>
            <th scope="col" className="ps-3">
              Obligación
            </th>
            {conUnidad && <th scope="col">Unidad</th>}
            <th scope="col">Concepto</th>
            <th scope="col">Periodo</th>
            <th scope="col">Vencimiento</th>
            <th scope="col" className="text-end">
              Valor
            </th>
            <th scope="col" className="text-end">
              Abonos
            </th>
            <th scope="col" className="text-end">
              Saldo
            </th>
            <th scope="col">Estado</th>
            <th scope="col" className="pe-3">
              <span className="visually-hidden">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {datos.map((o) => {
            const e = estadoObligacion(o);
            return (
              <tr key={o.id}>
                <td className="ps-3 fw-semibold text-nowrap">{o.numeroVisible}</td>
                {conUnidad && (
                  <td>
                    {nombreUnidad(o.unidad)}
                    <small className="d-block text-body-secondary">
                      {o.propietarios.map((p) => p.nombre).join(', ') ||
                        'Sin propietario registrado'}
                    </small>
                  </td>
                )}
                <td>{nombreConcepto(o.concepto)}</td>
                <td className="text-nowrap">{nombrePeriodo(o.periodo)}</td>
                <td className="text-nowrap">{fecha(o.fechaVencimiento)}</td>
                <td className="text-end" style={NUM}>
                  {dinero(o.cargos)}
                </td>
                <td className="text-end" style={NUM}>
                  {dinero(Number(o.pagos) + Number(o.creditos))}
                </td>
                <td className="text-end fw-semibold" style={NUM}>
                  {dinero(o.saldo)}
                </td>
                <td>
                  <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
                </td>
                <td className="pe-3 text-end">
                  <Button
                    size="sm"
                    variant="outline-primary"
                    className="text-nowrap"
                    aria-label={`Ver detalle de ${o.numeroVisible}`}
                    onClick={() => alVer(o.id)}
                  >
                    Ver detalle
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

/** Pantalla C: detalle de la obligación y trazabilidad. */
export function DetalleObligacion({
  id,
  clave,
  permisos,
  alCerrar,
  alAjustar,
}: {
  id: string;
  clave: readonly unknown[];
  permisos: PermisosCartera;
  alCerrar: () => void;
  alAjustar: (o: Obligacion) => void;
}) {
  const q = useQuery({
    queryKey: [...clave, 'obligacion', id],
    queryFn: () => carteraApi.detalleObligacion(id),
  });
  const o = q.data;
  const e = o && estadoObligacion(o);
  return (
    <Modal
      show
      onHide={alCerrar}
      centered
      size="lg"
      animation={!sinAnimacion}
      aria-labelledby="titulo-detalle-obligacion"
    >
      <Modal.Header closeButton>
        <Modal.Title
          id="titulo-detalle-obligacion"
          className="d-flex flex-wrap align-items-center gap-2"
        >
          {o
            ? `${o.numeroVisible} · ${nombreConcepto(o.concepto)} ${nombrePeriodo(o.periodo)}`
            : 'Detalle de la obligación'}
          {e && <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {q.isPending && <p role="status">Cargando obligación…</p>}
        {q.isError && <Alerta tono="error">{mensajeDe(q.error)}</Alerta>}
        {o && (
          <>
            <dl className="row mb-3">
              <dt className="col-sm-4 fw-normal text-body-secondary">Unidad</dt>
              <dd className="col-sm-8 fw-semibold">
                {nombreUnidad(o.unidad)} ·{' '}
                {o.propietarios.map((p) => p.nombre).join(', ') || 'sin propietario registrado'}
              </dd>
              <dt className="col-sm-4 fw-normal text-body-secondary">Emisión y vencimiento</dt>
              <dd className="col-sm-8 fw-semibold">
                {fecha(o.fechaEmision)} — {fecha(o.fechaVencimiento)}
                {o.vencida ? ` · ${TRAMOS.find(([t]) => t === o.tramo)?.[1]}` : ''}
              </dd>
              <dt className="col-sm-4 fw-normal text-body-secondary">Valor inicial</dt>
              <dd className="col-sm-8 fw-semibold">{dinero(o.valor)}</dd>
              <dt className="col-sm-4 fw-normal text-body-secondary">
                Pagos verificados aplicados
              </dt>
              <dd className="col-sm-8 fw-semibold">{dinero(o.pagos)}</dd>
              {Number(o.creditos) > 0 && (
                <>
                  <dt className="col-sm-4 fw-normal text-body-secondary">Ajustes crédito</dt>
                  <dd className="col-sm-8 fw-semibold">{dinero(o.creditos)}</dd>
                </>
              )}
              <dt className="col-sm-4 fw-normal text-body-secondary">Saldo</dt>
              <dd className="col-sm-8 fw-semibold">{dinero(o.saldo)}</dd>
              <dt className="col-sm-4 fw-normal text-body-secondary">Origen</dt>
              <dd className="col-sm-8">
                {
                  {
                    MANUAL: 'Registro manual',
                    GENERACION: 'Generación de cuotas',
                    IMPORTACION: 'Importación de saldos iniciales',
                  }[o.origen]
                }{' '}
                · {o.creadoPorNombre}
                {o.descripcion ? ` · ${o.descripcion}` : ''}
              </dd>
            </dl>
            <h2 className="h6">Movimientos</h2>
            <TablaMovimientos movimientos={o.movimientos} conObligacion={false} />
            <p className="small text-body-secondary">
              Los pagos pendientes de verificar no reducen este saldo.
            </p>
            {o.ajustes.length > 0 && (
              <>
                <h2 className="h6">Ajustes</h2>
                <ul className="list-unstyled">
                  {o.ajustes.map((a) => (
                    <li key={a.id} className="border-bottom py-2">
                      {a.tipo === 'CREDITO' ? 'Crédito' : 'Débito'} por{' '}
                      <strong>{dinero(a.valor)}</strong> ·{' '}
                      <Etiqueta tono={AJUSTE[a.estado].tono}>{AJUSTE[a.estado].texto}</Etiqueta>
                      <span className="d-block">
                        {a.motivo}
                        {a.soporte ? ` · Soporte: ${a.soporte}` : ''}
                      </span>
                      <small className="text-body-secondary">
                        Solicitó {a.solicitadoPorNombre} el {fechaHora(a.createdAt)}
                        {a.resueltoEn
                          ? ` · Resolvió ${a.resueltoPorNombre} el ${fechaHora(a.resueltoEn)}: ${a.notaResolucion}`
                          : ''}
                      </small>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h2 className="h6">Trazabilidad</h2>
            <ul className="list-unstyled mb-0">
              {o.historial.map((h) => (
                <li key={h.id} className="small py-1">
                  {fechaHora(h.createdAt)} · {nombreAccion(h.accion)} · {h.actor}
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {o && permisos.editar && (
          <Button
            variant="outline-primary"
            className="me-auto"
            onClick={() => alAjustar({ ...o, unidadId: o.unidad.id })}
          >
            Solicitar ajuste…
          </Button>
        )}
        <Button variant="secondary" onClick={alCerrar}>
          Cerrar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
