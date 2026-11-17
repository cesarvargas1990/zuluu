import { useMemo, useState, type FormEvent } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { ErrorApi } from '@/api/cliente';
import type { Propietario, UnidadPrivada } from '@/api/propietarios';
import { recaudosApi, type MedioPago, type PosibleDuplicado } from '@/api/recaudos';
import { Alerta, Boton } from '@/componentes/ui';
import { MEDIOS, centavosDe, decimalDe, dinero, fecha, hoy, nombreEstado } from './formato';

const TIPOS_SOPORTE = ['application/pdf', 'image/jpeg', 'image/png'];
const DIEZ_MB = 10 * 1024 * 1024;
const sinAnimacion = import.meta.env.MODE === 'test';

interface Props {
  unidades: UnidadPrivada[];
  propietarios: Propietario[];
  alCerrar: () => void;
  /** El pago quedó registrado; `aviso` es el mensaje para mostrar en el listado. */
  alRegistrar: (aviso: { tono: 'ok' | 'aviso'; texto: string }) => void;
}

const inicial = () => ({
  fechaPago: hoy(),
  valor: '',
  medio: 'TRANSFERENCIA' as MedioPago,
  referencia: '',
  banco: '',
  pagador: '',
  observacion: '',
  unidadId: '',
  propietarioId: '',
});

export function FormularioPago({ unidades, propietarios, alCerrar, alRegistrar }: Props) {
  const [datos, setDatos] = useState(inicial);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState('');
  const [error, setError] = useState<ErrorApi | Error | null>(null);
  const [duplicados, setDuplicados] = useState<PosibleDuplicado[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiar = (parcial: Partial<ReturnType<typeof inicial>>) => {
    setDatos((d) => ({ ...d, ...parcial }));
    setDuplicados(null);
  };

  const centavos = centavosDe(datos.valor);
  const unidad = unidades.find((u) => u.id === datos.unidadId);
  // Con unidad elegida se ofrecen sus propietarios vigentes; sin unidad, todos.
  const opcionesPropietario = useMemo(
    () =>
      unidad
        ? unidad.titularidades.map((t) => t.propietario)
        : propietarios.map((p) => ({ id: p.id, nombre: p.nombre })),
    [unidad, propietarios],
  );
  const errorCampo = (campo: string) =>
    error instanceof ErrorApi ? error.deCampo(campo) : undefined;

  function elegirUnidad(unidadId: string) {
    const elegida = unidades.find((u) => u.id === unidadId);
    const titular =
      elegida?.titularidades.find((t) => t.tipo === 'TITULAR') ?? elegida?.titularidades[0];
    cambiar({ unidadId, propietarioId: titular?.propietario.id ?? '' });
  }

  function elegirArchivo(f: File | null) {
    setErrorArchivo('');
    if (f && (!TIPOS_SOPORTE.includes(f.type) || f.size > DIEZ_MB)) {
      setArchivo(null);
      setErrorArchivo('El archivo no cumple el formato o tamaño permitido.');
      return;
    }
    setArchivo(f);
  }

  async function guardar(e: FormEvent, confirmarDuplicado = false) {
    e.preventDefault();
    if (centavos == null) return;
    setError(null);
    setGuardando(true);
    try {
      const pago = await recaudosApi.registrar(
        {
          fechaPago: datos.fechaPago,
          valor: decimalDe(centavos),
          medio: datos.medio,
          referencia: datos.referencia.trim() || null,
          banco: datos.banco.trim() || null,
          pagador: datos.pagador.trim() || null,
          observacion: datos.observacion.trim() || null,
          unidadId: datos.unidadId || null,
          propietarioId: datos.propietarioId || null,
        },
        confirmarDuplicado,
      );
      let soporteFallido = '';
      if (archivo) {
        try {
          await recaudosApi.subirSoporte(pago.id, archivo);
        } catch (fallo) {
          soporteFallido = fallo instanceof Error ? fallo.message : 'error desconocido';
        }
      }
      if (soporteFallido) {
        alRegistrar({
          tono: 'aviso',
          texto: `Pago ${pago.numeroVisible} registrado, pero el comprobante no se cargó (${soporteFallido}). Adjúntelo desde el detalle del pago.`,
        });
      } else if (!pago.unidadId) {
        alRegistrar({
          tono: 'aviso',
          texto: `Pago ${pago.numeroVisible} registrado. El pago quedó pendiente de identificación y no afecta la cartera.`,
        });
      } else {
        alRegistrar({
          tono: 'ok',
          texto: `Pago ${pago.numeroVisible} registrado. Está pendiente de verificación.`,
        });
      }
    } catch (fallo) {
      const similares =
        fallo instanceof ErrorApi && fallo.status === 409
          ? (fallo.cuerpo as { duplicados?: PosibleDuplicado[] } | undefined)?.duplicados
          : undefined;
      if (similares?.length) setDuplicados(similares);
      else setError(fallo instanceof Error ? fallo : new Error('Ocurrió un error inesperado.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      show
      onHide={alCerrar}
      centered
      size="lg"
      backdrop="static"
      animation={!sinAnimacion}
      aria-labelledby="titulo-registrar-pago"
    >
      <Modal.Header closeButton>
        <Modal.Title id="titulo-registrar-pago">Registrar pago</Modal.Title>
      </Modal.Header>
      <Form onSubmit={(e) => void guardar(e)} noValidate={false}>
        <Modal.Body>
          <p className="small text-body-secondary">Los campos marcados con * son obligatorios.</p>
          {error && !(error instanceof ErrorApi && error.errores?.length) && (
            <Alerta tono="error" className="mb-3">
              {error.message}
            </Alerta>
          )}
          <div className="row g-3">
            <div className="col-md-4">
              <Form.Group controlId="pago-fecha">
                <Form.Label>Fecha del pago *</Form.Label>
                <Form.Control
                  type="date"
                  required
                  max={hoy()}
                  value={datos.fechaPago}
                  onChange={(e) => cambiar({ fechaPago: e.target.value })}
                  isInvalid={!!errorCampo('fechaPago')}
                />
                <Form.Control.Feedback type="invalid">
                  {errorCampo('fechaPago')}
                </Form.Control.Feedback>
              </Form.Group>
            </div>
            <div className="col-md-4">
              <Form.Group controlId="pago-valor">
                <Form.Label>Valor recibido (COP) *</Form.Label>
                <Form.Control
                  required
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="580.000"
                  value={datos.valor}
                  onChange={(e) => cambiar({ valor: e.target.value })}
                  isInvalid={(datos.valor !== '' && centavos == null) || !!errorCampo('valor')}
                  aria-describedby="pago-valor-ayuda"
                />
                <Form.Text
                  id="pago-valor-ayuda"
                  className={centavos == null && datos.valor ? 'text-danger' : undefined}
                >
                  {centavos != null
                    ? `Se registrará ${dinero(centavos / 100)}`
                    : datos.valor
                      ? 'Escriba un valor mayor que cero, por ejemplo 580.000'
                      : 'Punto para miles y coma para decimales.'}
                </Form.Text>
              </Form.Group>
            </div>
            <div className="col-md-4">
              <Form.Group controlId="pago-medio">
                <Form.Label>Medio de pago *</Form.Label>
                <Form.Select
                  required
                  value={datos.medio}
                  onChange={(e) => cambiar({ medio: e.target.value as MedioPago })}
                >
                  {MEDIOS.map(([codigo, nombre]) => (
                    <option key={codigo} value={codigo}>
                      {nombre}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            <div className="col-md-4">
              <Form.Group controlId="pago-referencia">
                <Form.Label>Referencia de la operación</Form.Label>
                <Form.Control
                  maxLength={80}
                  value={datos.referencia}
                  onChange={(e) => cambiar({ referencia: e.target.value })}
                />
              </Form.Group>
            </div>
            <div className="col-md-4">
              <Form.Group controlId="pago-banco">
                <Form.Label>Banco u origen</Form.Label>
                <Form.Control
                  maxLength={120}
                  value={datos.banco}
                  onChange={(e) => cambiar({ banco: e.target.value })}
                />
              </Form.Group>
            </div>
            <div className="col-md-4">
              <Form.Group controlId="pago-pagador">
                <Form.Label>Pagador</Form.Label>
                <Form.Control
                  maxLength={180}
                  value={datos.pagador}
                  onChange={(e) => cambiar({ pagador: e.target.value })}
                  aria-describedby="pago-pagador-ayuda"
                />
                <Form.Text id="pago-pagador-ayuda">Si es distinto del propietario.</Form.Text>
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Group controlId="pago-unidad">
                <Form.Label>Villa o lote</Form.Label>
                <Form.Select value={datos.unidadId} onChange={(e) => elegirUnidad(e.target.value)}>
                  <option value="">Sin identificar (pendiente)</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.tipo === 'VILLA' ? 'Villa' : 'Lote'} · {u.codigo}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Group controlId="pago-propietario">
                <Form.Label>Propietario</Form.Label>
                <Form.Select
                  value={datos.propietarioId}
                  onChange={(e) => cambiar({ propietarioId: e.target.value })}
                >
                  <option value="">Sin identificar</option>
                  {opcionesPropietario.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            {!datos.unidadId && (
              <div className="col-12">
                <Alerta tono="info">
                  Un pago sin unidad queda por identificar y no se aplica a cartera hasta asignarle
                  la villa o lote.
                </Alerta>
              </div>
            )}
            <div className="col-12">
              <Form.Group controlId="pago-soporte">
                <Form.Label>Comprobante</Form.Label>
                <Form.Control
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  isInvalid={!!errorArchivo}
                  onChange={(e) => elegirArchivo((e.target as HTMLInputElement).files?.[0] ?? null)}
                  aria-describedby="pago-soporte-ayuda"
                />
                <Form.Control.Feedback type="invalid">{errorArchivo}</Form.Control.Feedback>
                <Form.Text id="pago-soporte-ayuda">
                  PDF, JPG o PNG · máximo 10 MB. Puede adjuntarlo después.
                </Form.Text>
              </Form.Group>
            </div>
            <div className="col-12">
              <Form.Group controlId="pago-observacion">
                <Form.Label>Observaciones</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  maxLength={1000}
                  value={datos.observacion}
                  onChange={(e) => cambiar({ observacion: e.target.value })}
                />
              </Form.Group>
            </div>
          </div>

          {duplicados && (
            <div className="alert alert-warning mt-3 mb-0" role="alert">
              <p className="fw-semibold mb-2">
                <i className="bi bi-exclamation-triangle me-2" aria-hidden="true" />
                Encontramos un pago similar. Revise antes de continuar.
              </p>
              <ul className="mb-3 ps-3">
                {duplicados.map((d) => (
                  <li key={d.id}>
                    {d.numeroVisible} · {fecha(d.fechaPago)} · {dinero(d.valor)} ·{' '}
                    {d.unidad ?? 'sin unidad'}
                    {d.referencia ? ` · ref. ${d.referencia}` : ''} · {nombreEstado(d.estado)}
                  </li>
                ))}
              </ul>
              <Boton
                variante="secundario"
                cargando={guardando}
                onClick={(e) => void guardar(e, true)}
              >
                No es el mismo pago: registrar
              </Boton>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <span className="me-auto small text-body-secondary">
            Estado inicial: <strong>Pendiente de verificar</strong>
          </span>
          <Button variant="outline-secondary" onClick={alCerrar}>
            Cancelar
          </Button>
          <Boton type="submit" cargando={guardando} disabled={centavos == null || !!duplicados}>
            {guardando ? 'Guardando…' : 'Guardar pago'}
          </Boton>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
