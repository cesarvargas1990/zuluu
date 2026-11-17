import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Nav from 'react-bootstrap/Nav';
import Table from 'react-bootstrap/Table';
import { carteraApi, type Obligacion } from '@/api/cartera';
import type { UnidadPrivada } from '@/api/propietarios';
import { recaudosApi, type ConceptoImputacion, type RecaudoDetalle } from '@/api/recaudos';
import { Alerta, Boton, Etiqueta } from '@/componentes/ui';
import {
  CONCEPTOS,
  bytesDeBase64,
  centavosDe,
  decimalDe,
  descargar,
  dinero,
  fecha,
  fechaHora,
  nombreAccion,
  nombreConcepto,
  nombreEstado,
  nombreMedio,
  nombrePeriodo,
  tonoEstado,
} from './formato';

export interface PermisosRecaudos {
  crear: boolean;
  editar: boolean;
  aprobar: boolean;
  exportar: boolean;
}

interface Props {
  id: string;
  clave: readonly unknown[];
  permisos: PermisosRecaudos;
  unidades: UnidadPrivada[];
  alCerrar: () => void;
}

type Pestana = 'general' | 'imputacion' | 'historial';
interface Linea {
  clave: number;
  concepto: ConceptoImputacion;
  periodo: string;
  valorObligacion: string;
  valorAplicado: string;
}

const sinAnimacion = import.meta.env.MODE === 'test';
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error inesperado.');
const enPesos = (decimal: string) => decimal.replace('.', ',');

export function DetallePago({ id, clave, permisos, unidades, alCerrar }: Props) {
  const consulta = useQueryClient();
  const detalle = useQuery({
    queryKey: [...clave, 'detalle', id],
    queryFn: () => recaudosApi.detalle(id),
  });
  const [pestana, setPestana] = useState<Pestana>('general');
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /** Ejecuta una acción, refresca el listado y muestra el resultado dentro del diálogo. */
  async function ejecutar(accion: () => Promise<RecaudoDetalle | unknown>, exito: string) {
    setAviso(null);
    setOcupado(true);
    try {
      const nuevo = await accion();
      if (nuevo && typeof nuevo === 'object' && 'historial' in nuevo) {
        consulta.setQueryData([...clave, 'detalle', id], nuevo);
      } else {
        await detalle.refetch();
      }
      setAviso({ tono: 'ok', texto: exito });
      void consulta.invalidateQueries({ queryKey: [...clave, 'lista'] });
      return true;
    } catch (e) {
      setAviso({ tono: 'error', texto: mensajeDe(e) });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const p = detalle.data;
  return (
    <Modal
      show
      onHide={alCerrar}
      centered
      size="xl"
      animation={!sinAnimacion}
      aria-labelledby="titulo-detalle-pago"
    >
      <Modal.Header closeButton>
        <Modal.Title id="titulo-detalle-pago" className="d-flex flex-wrap align-items-center gap-2">
          {p ? `Pago ${p.numeroVisible}` : 'Detalle del pago'}
          {p && <Etiqueta tono={tonoEstado(p.estado)}>{nombreEstado(p.estado)}</Etiqueta>}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {detalle.isPending && <p role="status">Cargando pago…</p>}
        {detalle.isError && <Alerta tono="error">{mensajeDe(detalle.error)}</Alerta>}
        {p && (
          <>
            <Nav
              variant="tabs"
              activeKey={pestana}
              onSelect={(k) => k && setPestana(k as Pestana)}
              className="mb-3"
            >
              <Nav.Item>
                <Nav.Link eventKey="general">Información general</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="imputacion">Imputación</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="historial">Historial y soporte ({p.soportes.length})</Nav.Link>
              </Nav.Item>
            </Nav>
            {aviso && (
              <Alerta tono={aviso.tono} className="mb-3">
                {aviso.texto}
              </Alerta>
            )}
            {pestana === 'general' && (
              <General
                p={p}
                permisos={permisos}
                unidades={unidades}
                ocupado={ocupado}
                ejecutar={ejecutar}
                irAImputacion={() => setPestana('imputacion')}
              />
            )}
            {pestana === 'imputacion' && (
              <Imputacion
                key={p.estado}
                p={p}
                permisos={permisos}
                unidades={unidades}
                ocupado={ocupado}
                ejecutar={ejecutar}
              />
            )}
            {pestana === 'historial' && (
              <Historial
                p={p}
                permisos={permisos}
                ocupado={ocupado}
                ejecutar={ejecutar}
                alError={(texto) => setAviso({ tono: 'error', texto })}
              />
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={alCerrar}>
          Cerrar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

type Ejecutar = (accion: () => Promise<unknown>, exito: string) => Promise<boolean>;
interface PropsSeccion {
  p: RecaudoDetalle;
  permisos: PermisosRecaudos;
  ocupado: boolean;
  ejecutar: Ejecutar;
}

function General({
  p,
  permisos,
  unidades,
  ocupado,
  ejecutar,
  irAImputacion,
}: PropsSeccion & { unidades: UnidadPrivada[]; irAImputacion: () => void }) {
  const abierto = p.estado === 'PENDIENTE' || p.estado === 'OBSERVADO';
  const [unidadId, setUnidadId] = useState('');
  const [observacion, setObservacion] = useState('');
  const [motivo, setMotivo] = useState('');
  const [anulando, setAnulando] = useState(false);
  const elegida = unidades.find((u) => u.id === unidadId);

  const dato = (etiqueta: string, valor: ReactNode) => (
    <>
      <dt className="col-sm-5 text-body-secondary fw-normal">{etiqueta}</dt>
      <dd className="col-sm-7 fw-semibold">{valor}</dd>
    </>
  );

  return (
    <div className="row g-4">
      <div className="col-lg-6">
        <h2 className="h6">Datos del movimiento</h2>
        <dl className="row mb-0">
          {dato(
            'Unidad',
            p.unidad
              ? `${p.unidad.tipo === 'VILLA' ? 'Villa' : 'Lote'} · ${p.unidad.codigo}`
              : 'Por identificar',
          )}
          {dato('Propietario', p.propietario?.nombre ?? 'Sin identificar')}
          {dato('Pagador', p.pagador ?? 'No registrado')}
          {dato('Fecha del pago', fecha(p.fechaPago))}
          {dato('Valor', dinero(p.valor))}
          {dato('Medio', nombreMedio(p.medio))}
          {dato('Referencia', p.referencia ?? 'Sin referencia')}
          {dato('Banco u origen', p.banco ?? 'No registrado')}
          {dato(
            'Registrado',
            `${fechaHora(p.createdAt)} · ${p.creadoPorNombre ?? 'Usuario'}${p.origen === 'IMPORTACION' ? ' · importado de Excel' : ''}`,
          )}
          {p.observacion && dato('Observaciones', p.observacion)}
          {p.estado === 'VERIFICADO' && dato('Saldo a favor', dinero(p.saldoAFavor))}
          {p.revisadoEn &&
            dato(
              p.estado === 'OBSERVADO' ? 'Observado' : 'Revisado',
              `${fechaHora(p.revisadoEn)} · ${p.revisadoPorNombre ?? 'Usuario'}`,
            )}
          {p.observacionVerificacion && dato('Nota de revisión', p.observacionVerificacion)}
        </dl>
      </div>
      <div className="col-lg-6 d-flex flex-column gap-3">
        {p.posibleDuplicado && p.estado !== 'ANULADO' && (
          <Alerta tono="aviso">
            Se registró con un pago similar ya existente. Confirme que no esté repetido antes de
            verificar.
          </Alerta>
        )}
        {p.estado === 'ANULADO' && (
          <Alerta tono="info">
            Anulado el {p.anuladoEn ? fechaHora(p.anuladoEn) : ''} por{' '}
            {p.anuladoPorNombre ?? 'un usuario'}. Motivo: {p.motivoAnulacion}
          </Alerta>
        )}
        {!p.unidadId && abierto && (
          <section>
            <h2 className="h6">Identificar el pago</h2>
            {permisos.editar ? (
              <>
                <Form.Group controlId="detalle-unidad" className="mb-2">
                  <Form.Label>Villa o lote al que corresponde</Form.Label>
                  <Form.Select value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
                    <option value="">Seleccione la unidad</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.tipo === 'VILLA' ? 'Villa' : 'Lote'} · {u.codigo}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <Boton
                  disabled={!unidadId}
                  cargando={ocupado}
                  onClick={() => {
                    const titular =
                      elegida?.titularidades.find((t) => t.tipo === 'TITULAR') ??
                      elegida?.titularidades[0];
                    void ejecutar(
                      () =>
                        recaudosApi.modificar(p.id, {
                          unidadId,
                          ...(p.propietarioId
                            ? {}
                            : { propietarioId: titular?.propietario.id ?? null }),
                        }),
                      'Unidad asignada. El pago ya puede verificarse.',
                    );
                  }}
                >
                  Asignar unidad
                </Boton>
              </>
            ) : (
              <Alerta tono="info">
                El pago está por identificar y no afecta la cartera. Contabilidad o administración
                le asignará la unidad.
              </Alerta>
            )}
          </section>
        )}
        {abierto && permisos.aprobar && (
          <section>
            <h2 className="h6">Verificación</h2>
            {p.unidadId ? (
              <Boton onClick={irAImputacion}>
                <i className="bi bi-check2-circle" aria-hidden="true" /> Distribuir y verificar
              </Boton>
            ) : (
              <p className="small text-body-secondary mb-0">
                Asigne la unidad para poder verificar el pago.
              </p>
            )}
            {p.estado === 'PENDIENTE' && (
              <div className="mt-3">
                <Form.Group controlId="detalle-observacion" className="mb-2">
                  <Form.Label>¿Hay algo por aclarar? Describa la observación</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    maxLength={1000}
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                  />
                </Form.Group>
                <Boton
                  variante="secundario"
                  disabled={observacion.trim().length < 5}
                  cargando={ocupado}
                  onClick={() =>
                    void ejecutar(
                      () => recaudosApi.observar(p.id, observacion.trim()),
                      'El pago quedó observado para revisión.',
                    ).then((ok) => ok && setObservacion(''))
                  }
                >
                  Marcar como observado
                </Boton>
              </div>
            )}
          </section>
        )}
        {abierto && !permisos.aprobar && p.unidadId && (
          <Alerta tono="info">
            Pendiente de verificación por contabilidad o administración. Aún no afecta la cartera.
          </Alerta>
        )}
        {p.estado !== 'ANULADO' && permisos.aprobar && (
          <section className="mt-auto pt-3 border-top">
            {!anulando ? (
              <Button variant="outline-danger" size="sm" onClick={() => setAnulando(true)}>
                Anular pago…
              </Button>
            ) : (
              <>
                <Form.Group controlId="detalle-motivo" className="mb-2">
                  <Form.Label>Motivo de la anulación de {p.numeroVisible} *</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    maxLength={1000}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    aria-describedby="detalle-motivo-ayuda"
                  />
                  <Form.Text id="detalle-motivo-ayuda">
                    El pago no se borra: queda anulado con su historial. Esta acción no se puede
                    deshacer.
                  </Form.Text>
                </Form.Group>
                <div className="d-flex gap-2">
                  <Boton
                    variante="peligro"
                    disabled={motivo.trim().length < 10}
                    cargando={ocupado}
                    onClick={() =>
                      void ejecutar(
                        () => recaudosApi.anular(p.id, motivo.trim()),
                        'Pago anulado.',
                      ).then((ok) => ok && setAnulando(false))
                    }
                  >
                    Sí, anular pago
                  </Boton>
                  <Button variant="outline-secondary" onClick={() => setAnulando(false)}>
                    No anular
                  </Button>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** Espera las obligaciones abiertas de la unidad para proponer la distribución del pago. */
function Imputacion(props: PropsSeccion & { unidades: UnidadPrivada[] }) {
  const { p, permisos } = props;
  const editable =
    (p.estado === 'PENDIENTE' || p.estado === 'OBSERVADO') && permisos.aprobar && !!p.unidadId;
  const cartera = useQuery({
    queryKey: ['req004', 'cuenta-para-pago', p.unidadId],
    queryFn: () => carteraApi.estadoDeCuenta(p.unidadId!),
    enabled: editable,
    retry: false,
    staleTime: 0,
  });
  if (editable && cartera.isPending)
    return <p role="status">Consultando la cartera de la unidad…</p>;
  const abiertas = cartera.data?.obligaciones.filter((o) => Number(o.saldo) > 0) ?? [];
  return <EditorImputacion {...props} abiertas={abiertas} key={`${p.estado}-${abiertas.length}`} />;
}

function EditorImputacion({
  p,
  permisos,
  unidades,
  ocupado,
  ejecutar,
  abiertas,
}: PropsSeccion & { unidades: UnidadPrivada[]; abiertas: Obligacion[] }) {
  const abierto = p.estado === 'PENDIENTE' || p.estado === 'OBSERVADO';
  const pagoCentavos = Math.round(Number(p.valor) * 100);
  const cuota = unidades.find((u) => u.id === p.unidadId)?.cuotaMensual;
  const [siguiente, setSiguiente] = useState(abiertas.length + 1);
  const [lineas, setLineas] = useState<Linea[]>(() => {
    if (abiertas.length > 0) {
      // Con cartera registrada: se propone pagar las obligaciones más antiguas primero.
      let disponible = pagoCentavos;
      const propuestas: Linea[] = [];
      for (const [i, o] of abiertas.entries()) {
        if (disponible <= 0) break;
        const saldo = Math.round(Number(o.saldo) * 100);
        const aplicar = Math.min(saldo, disponible);
        disponible -= aplicar;
        propuestas.push({
          clave: i,
          concepto: o.concepto,
          periodo: o.periodo,
          valorObligacion: enPesos(decimalDe(saldo)),
          valorAplicado: enPesos(decimalDe(aplicar)),
        });
      }
      return propuestas;
    }
    const cuotaCentavos = cuota ? Math.round(Number(cuota) * 100) : 0;
    const aplicar = cuotaCentavos > 0 ? Math.min(cuotaCentavos, pagoCentavos) : pagoCentavos;
    return [
      {
        clave: 0,
        concepto: 'CUOTA_ADMINISTRACION',
        periodo: p.fechaPago.slice(0, 7),
        valorObligacion: cuotaCentavos > 0 ? enPesos(decimalDe(cuotaCentavos)) : '',
        valorAplicado: enPesos(decimalDe(aplicar)),
      },
    ];
  });
  const [observacion, setObservacion] = useState('');

  if (!abierto) {
    return (
      <>
        {p.imputaciones.length === 0 ? (
          <p className="text-body-secondary">
            {p.estado === 'VERIFICADO'
              ? 'El pago se verificó sin distribuirlo: todo su valor quedó como saldo a favor.'
              : 'Este pago no tiene distribución registrada.'}
          </p>
        ) : (
          <div className="table-responsive">
            <Table className="align-middle">
              <caption className="visually-hidden">Distribución del pago por concepto</caption>
              <thead className="table-light">
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col">Periodo</th>
                  <th scope="col" className="text-end">
                    Valor de la obligación
                  </th>
                  <th scope="col" className="text-end">
                    Valor aplicado
                  </th>
                  <th scope="col" className="text-end">
                    Saldo pendiente
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.imputaciones.map((i) => (
                  <tr key={i.id}>
                    <td>{nombreConcepto(i.concepto)}</td>
                    <td>{nombrePeriodo(i.periodo)}</td>
                    <td className="text-end">{dinero(i.valorObligacion)}</td>
                    <td className="text-end fw-semibold">{dinero(i.valorAplicado)}</td>
                    <td className="text-end">{dinero(i.saldoPendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {p.estado !== 'PENDIENTE' && (
          <p className="mb-0">
            Saldo a favor (anticipo): <strong>{dinero(p.saldoAFavor)}</strong>
            {p.estado === 'ANULADO' && ' · sin efecto por anulación'}
          </p>
        )}
      </>
    );
  }
  if (!permisos.aprobar) {
    return (
      <Alerta tono="info">
        La distribución del pago la registra contabilidad o administración al verificarlo.
      </Alerta>
    );
  }
  if (!p.unidadId) {
    return (
      <Alerta tono="aviso">
        El pago está por identificar. Asigne la villa o lote en «Información general» antes de
        distribuirlo.
      </Alerta>
    );
  }

  const cambiar = (clave: number, parcial: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...parcial } : l)));
  const calculadas = lineas.map((l) => ({
    ...l,
    aplicado: centavosDe(l.valorAplicado),
    obligacion: l.valorObligacion.trim() ? centavosDe(l.valorObligacion) : undefined,
  }));
  const total = calculadas.reduce((s, l) => s + (l.aplicado ?? 0), 0);
  const repetida = calculadas.some(
    (l, i) =>
      calculadas.findIndex((o) => o.concepto === l.concepto && o.periodo === l.periodo) !== i,
  );
  const problema = calculadas.some((l) => l.aplicado == null)
    ? 'Escriba el valor a aplicar en cada fila.'
    : calculadas.some((l) => !/^\d{4}-\d{2}$/.test(l.periodo))
      ? 'Indique el periodo de cada fila.'
      : calculadas.some((l) => l.obligacion === null)
        ? 'Revise el valor de la obligación.'
        : calculadas.some((l) => l.obligacion != null && l.aplicado! > l.obligacion)
          ? 'El valor aplicado no puede superar el valor de la obligación.'
          : repetida
            ? 'Hay un concepto y periodo repetidos.'
            : total > pagoCentavos
              ? 'La suma aplicada supera el valor del pago.'
              : '';

  return (
    <>
      <p className="small text-body-secondary">
        Distribuya el pago entre las obligaciones que cubre. Lo que no aplique quedará como saldo a
        favor de la unidad.{' '}
        {abiertas.length > 0
          ? `La unidad tiene ${abiertas.length} ${abiertas.length === 1 ? 'obligación abierta' : 'obligaciones abiertas'} en cartera: se proponen las más antiguas primero. Al verificar, el saldo de cada una baja por el valor aplicado.`
          : 'La unidad no tiene obligaciones abiertas en cartera: la distribución queda registrada con el pago.'}
      </p>
      <div className="table-responsive">
        <Table className="align-middle">
          <caption className="visually-hidden">Distribución del pago por concepto</caption>
          <thead className="table-light">
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col">Periodo</th>
              <th scope="col">Valor de la obligación</th>
              <th scope="col">Valor a aplicar</th>
              <th scope="col" className="text-end">
                Saldo pendiente
              </th>
              <th scope="col">
                <span className="visually-hidden">Quitar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {calculadas.map((l, i) => (
              <tr key={l.clave}>
                <td style={{ minWidth: '13rem' }}>
                  <Form.Select
                    aria-label={`Concepto de la fila ${i + 1}`}
                    value={l.concepto}
                    onChange={(e) =>
                      cambiar(l.clave, { concepto: e.target.value as ConceptoImputacion })
                    }
                  >
                    {CONCEPTOS.map(([codigo, nombre]) => (
                      <option key={codigo} value={codigo}>
                        {nombre}
                      </option>
                    ))}
                  </Form.Select>
                </td>
                <td>
                  <Form.Control
                    type="month"
                    aria-label={`Periodo de la fila ${i + 1}`}
                    value={l.periodo}
                    onChange={(e) => cambiar(l.clave, { periodo: e.target.value })}
                  />
                </td>
                <td>
                  <Form.Control
                    inputMode="decimal"
                    placeholder="Opcional"
                    aria-label={`Valor de la obligación de la fila ${i + 1}`}
                    value={l.valorObligacion}
                    isInvalid={l.obligacion === null}
                    onChange={(e) => cambiar(l.clave, { valorObligacion: e.target.value })}
                  />
                </td>
                <td>
                  <Form.Control
                    inputMode="decimal"
                    aria-label={`Valor a aplicar de la fila ${i + 1}`}
                    value={l.valorAplicado}
                    isInvalid={
                      l.aplicado == null || (l.obligacion != null && l.aplicado > l.obligacion)
                    }
                    onChange={(e) => cambiar(l.clave, { valorAplicado: e.target.value })}
                  />
                </td>
                <td className="text-end">
                  {l.obligacion != null && l.aplicado != null && l.aplicado <= l.obligacion
                    ? dinero((l.obligacion - l.aplicado) / 100)
                    : '—'}
                </td>
                <td className="text-end">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    aria-label={`Quitar la fila ${i + 1}`}
                    onClick={() => setLineas((ls) => ls.filter((o) => o.clave !== l.clave))}
                  >
                    <i className="bi bi-x-lg" aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            ))}
            {calculadas.length === 0 && (
              <tr>
                <td colSpan={6} className="text-body-secondary">
                  Sin distribución: todo el pago quedará como saldo a favor (anticipo).
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
      <Button
        size="sm"
        variant="outline-primary"
        className="mb-3"
        onClick={() => {
          setLineas((ls) => [
            ...ls,
            {
              clave: siguiente,
              concepto: 'CUOTA_VENCIDA',
              periodo: '',
              valorObligacion: '',
              valorAplicado: '',
            },
          ]);
          setSiguiente((n) => n + 1);
        }}
      >
        <i className="bi bi-plus-lg me-1" aria-hidden="true" />
        Agregar concepto
      </Button>
      <dl className="row mb-3" aria-live="polite">
        <dt className="col-sm-4 fw-normal text-body-secondary">Valor del pago</dt>
        <dd className="col-sm-8 fw-semibold">{dinero(p.valor)}</dd>
        <dt className="col-sm-4 fw-normal text-body-secondary">Total aplicado</dt>
        <dd className="col-sm-8 fw-semibold">{dinero(total / 100)}</dd>
        <dt className="col-sm-4 fw-normal text-body-secondary">Saldo a favor</dt>
        <dd className="col-sm-8 fw-semibold">
          {total > pagoCentavos ? '—' : dinero((pagoCentavos - total) / 100)}
        </dd>
      </dl>
      {problema && (
        <Alerta tono="aviso" className="mb-3">
          {problema}
        </Alerta>
      )}
      <Form.Group controlId="imputacion-observacion" className="mb-3">
        <Form.Label>Nota de verificación</Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          maxLength={1000}
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
        />
      </Form.Group>
      <Boton
        disabled={!!problema}
        cargando={ocupado}
        onClick={() =>
          void ejecutar(
            () =>
              recaudosApi.verificar(
                p.id,
                calculadas.map((l) => ({
                  concepto: l.concepto,
                  periodo: l.periodo,
                  valorObligacion: l.obligacion != null ? decimalDe(l.obligacion) : null,
                  valorAplicado: decimalDe(l.aplicado!),
                })),
                observacion.trim(),
              ),
            'Pago verificado y aplicado correctamente.',
          )
        }
      >
        Verificar y aplicar
      </Boton>
    </>
  );
}

function Historial({
  p,
  permisos,
  ocupado,
  ejecutar,
  alError,
}: PropsSeccion & { alError: (texto: string) => void }) {
  async function bajar(soporteId: string) {
    try {
      const s = await recaudosApi.obtenerSoporte(p.id, soporteId);
      descargar(s.nombre, bytesDeBase64(s.contenido), s.mimeType);
    } catch (e) {
      alError(mensajeDe(e));
    }
  }
  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h2 className="h6 mb-0">Comprobantes</h2>
        {permisos.crear && p.estado !== 'ANULADO' && (
          <label className={`btn btn-outline-primary btn-sm mb-0${ocupado ? ' disabled' : ''}`}>
            <i className="bi bi-paperclip me-1" aria-hidden="true" />
            Adjuntar comprobante
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="visually-hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                e.currentTarget.value = '';
                if (archivo)
                  void ejecutar(
                    () => recaudosApi.subirSoporte(p.id, archivo),
                    'Comprobante cargado.',
                  );
              }}
            />
          </label>
        )}
      </div>
      {p.soportes.length === 0 ? (
        <p className="text-body-secondary">
          Este pago no tiene comprobante. PDF, JPG o PNG · máximo 10 MB.
        </p>
      ) : (
        <ul className="list-unstyled mb-4">
          {p.soportes.map((s) => (
            <li
              key={s.id}
              className="d-flex justify-content-between align-items-center gap-3 border-bottom py-2"
            >
              <span className="min-w-0 text-break">
                <i className="bi bi-file-earmark-text me-2 text-primary" aria-hidden="true" />
                {s.nombre}
                <small className="d-block text-body-secondary">
                  {Math.ceil(s.tamano / 1024)} KB · {fechaHora(s.createdAt)} · huella{' '}
                  {s.sha256.slice(0, 12)}…
                </small>
              </span>
              <Button
                size="sm"
                variant="outline-secondary"
                aria-label={`Descargar ${s.nombre}`}
                onClick={() => void bajar(s.id)}
              >
                Descargar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <h2 className="h6">Bitácora</h2>
      <div className="table-responsive">
        <Table size="sm" className="align-middle">
          <caption className="visually-hidden">Historial de operaciones sobre el pago</caption>
          <thead className="table-light">
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Usuario</th>
              <th scope="col">Acción</th>
              <th scope="col">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {p.historial.map((h) => (
              <tr key={h.id}>
                <td className="text-nowrap">{fechaHora(h.createdAt)}</td>
                <td>{h.actor}</td>
                <td>{nombreAccion(h.accion)}</td>
                <td>
                  <details>
                    <summary>Ver valores</summary>
                    <pre className="small text-wrap mb-0">
                      {JSON.stringify(
                        { antes: h.antes ?? undefined, despues: h.despues ?? undefined },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
