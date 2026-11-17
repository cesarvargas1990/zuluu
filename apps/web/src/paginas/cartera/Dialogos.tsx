import { useState, type FormEvent, type ReactNode } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { carteraApi, type Canal, type Obligacion } from '@/api/cartera';
import { ErrorApi } from '@/api/cliente';
import type { UnidadPrivada } from '@/api/propietarios';
import type { ConceptoImputacion } from '@/api/recaudos';
import { Alerta, Boton } from '@/componentes/ui';
import {
  CONCEPTOS,
  centavosDe,
  decimalDe,
  dinero,
  hoy,
  nombreConcepto,
  nombrePeriodo,
} from '../recaudos/formato';
import { CANALES, mensajeDe, nombreUnidad, sinAnimacion } from './textos';

export interface PermisosCartera {
  crear: boolean;
  editar: boolean;
  aprobar: boolean;
  exportar: boolean;
}

/** Marco común: título, formulario, error del API y botones. */
function Dialogo({
  id,
  titulo,
  accion,
  alCerrar,
  alEnviar,
  deshabilitado,
  children,
  grande,
}: {
  id: string;
  titulo: string;
  accion: string;
  alCerrar: () => void;
  alEnviar: () => Promise<void>;
  deshabilitado?: boolean;
  children: (errorCampo: (campo: string) => string | undefined) => ReactNode;
  grande?: boolean;
}) {
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);
  const errorCampo = (campo: string) =>
    error instanceof ErrorApi ? error.deCampo(campo) : undefined;
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      await alEnviar();
    } catch (fallo) {
      setError(fallo);
    } finally {
      setGuardando(false);
    }
  }
  return (
    <Modal
      show
      onHide={alCerrar}
      centered
      size={grande ? 'lg' : undefined}
      backdrop="static"
      animation={!sinAnimacion}
      aria-labelledby={id}
    >
      <Modal.Header closeButton>
        <Modal.Title id={id}>{titulo}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={(e) => void enviar(e)}>
        <Modal.Body>
          {error != null && !(error instanceof ErrorApi && error.errores?.length) && (
            <Alerta tono="error" className="mb-3">
              {mensajeDe(error)}
            </Alerta>
          )}
          {error instanceof ErrorApi && !!error.errores?.length && (
            <Alerta tono="error" className="mb-3">
              {error.errores.map((x) => x.mensaje).join('. ')}.
            </Alerta>
          )}
          {children(errorCampo)}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={alCerrar}>
            Cancelar
          </Button>
          <Boton type="submit" cargando={guardando} disabled={deshabilitado}>
            {guardando ? 'Guardando…' : accion}
          </Boton>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

function CampoValor({
  id,
  etiqueta,
  valor,
  alCambiar,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
}) {
  const centavos = centavosDe(valor);
  return (
    <Form.Group controlId={id}>
      <Form.Label>{etiqueta}</Form.Label>
      <Form.Control
        required
        inputMode="decimal"
        autoComplete="off"
        placeholder="550.000"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        isInvalid={valor !== '' && centavos == null}
        aria-describedby={`${id}-ayuda`}
      />
      <Form.Text
        id={`${id}-ayuda`}
        className={valor && centavos == null ? 'text-danger' : undefined}
      >
        {centavos != null
          ? `Equivale a ${dinero(centavos / 100)}`
          : valor
            ? 'Escriba un valor mayor que cero'
            : 'Punto para miles y coma para decimales.'}
      </Form.Text>
    </Form.Group>
  );
}

function SelectorUnidad({
  id,
  unidades,
  valor,
  alCambiar,
}: {
  id: string;
  unidades: UnidadPrivada[];
  valor: string;
  alCambiar: (v: string) => void;
}) {
  return (
    <Form.Group controlId={id}>
      <Form.Label>Villa o lote *</Form.Label>
      <Form.Select required value={valor} onChange={(e) => alCambiar(e.target.value)}>
        <option value="">Seleccione la unidad</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {nombreUnidad(u)}
          </option>
        ))}
      </Form.Select>
    </Form.Group>
  );
}

export function NuevaGestion({
  unidades,
  unidadId = '',
  alCerrar,
  alGuardar,
}: {
  unidades: UnidadPrivada[];
  unidadId?: string;
  alCerrar: () => void;
  alGuardar: (texto: string) => void;
}) {
  const [d, setD] = useState({
    unidadId,
    fecha: hoy(),
    canal: 'TELEFONO' as Canal,
    contacto: '',
    resultado: '',
    proximaFecha: '',
  });
  const [conCompromiso, setConCompromiso] = useState(false);
  const [c, setC] = useState({ fechaPactada: '', valor: '', observaciones: '' });
  const centavos = centavosDe(c.valor);
  return (
    <Dialogo
      id="titulo-gestion"
      titulo="Registrar gestión de cobro"
      accion="Registrar gestión"
      grande
      alCerrar={alCerrar}
      deshabilitado={conCompromiso && centavos == null}
      alEnviar={async () => {
        await carteraApi.crearGestion({
          unidadId: d.unidadId,
          fecha: d.fecha,
          canal: d.canal,
          contacto: d.contacto.trim() || null,
          resultado: d.resultado.trim(),
          proximaFecha: d.proximaFecha || null,
          compromiso: conCompromiso
            ? {
                fechaPactada: c.fechaPactada,
                valor: decimalDe(centavos!),
                observaciones: c.observaciones.trim() || null,
              }
            : null,
        });
        alGuardar(
          conCompromiso
            ? 'Compromiso registrado. El saldo no cambia hasta aplicar un pago válido.'
            : 'Gestión registrada. La gestión no modifica saldos.',
        );
      }}
    >
      {() => (
        <div className="row g-3">
          <div className="col-md-6">
            <SelectorUnidad
              id="gestion-unidad"
              unidades={unidades}
              valor={d.unidadId}
              alCambiar={(v) => setD({ ...d, unidadId: v })}
            />
          </div>
          <div className="col-md-3">
            <Form.Group controlId="gestion-fecha">
              <Form.Label>Fecha *</Form.Label>
              <Form.Control
                type="date"
                required
                max={hoy()}
                value={d.fecha}
                onChange={(e) => setD({ ...d, fecha: e.target.value })}
              />
            </Form.Group>
          </div>
          <div className="col-md-3">
            <Form.Group controlId="gestion-canal">
              <Form.Label>Canal *</Form.Label>
              <Form.Select
                value={d.canal}
                onChange={(e) => setD({ ...d, canal: e.target.value as Canal })}
              >
                {CANALES.map(([codigo, nombre]) => (
                  <option key={codigo} value={codigo}>
                    {nombre}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>
          <div className="col-md-6">
            <Form.Group controlId="gestion-contacto">
              <Form.Label>Persona contactada</Form.Label>
              <Form.Control
                maxLength={180}
                value={d.contacto}
                onChange={(e) => setD({ ...d, contacto: e.target.value })}
              />
            </Form.Group>
          </div>
          <div className="col-md-6">
            <Form.Group controlId="gestion-proxima">
              <Form.Label>Próximo seguimiento</Form.Label>
              <Form.Control
                type="date"
                min={d.fecha}
                value={d.proximaFecha}
                onChange={(e) => setD({ ...d, proximaFecha: e.target.value })}
              />
            </Form.Group>
          </div>
          <div className="col-12">
            <Form.Group controlId="gestion-resultado">
              <Form.Label>Resultado u observaciones *</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                required
                minLength={3}
                maxLength={1000}
                value={d.resultado}
                onChange={(e) => setD({ ...d, resultado: e.target.value })}
              />
            </Form.Group>
          </div>
          <div className="col-12">
            <Form.Check
              id="gestion-con-compromiso"
              type="switch"
              label="La persona se comprometió a pagar"
              checked={conCompromiso}
              onChange={(e) => setConCompromiso(e.target.checked)}
            />
          </div>
          {conCompromiso && (
            <>
              <div className="col-md-4">
                <Form.Group controlId="compromiso-fecha">
                  <Form.Label>Fecha pactada *</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    value={c.fechaPactada}
                    onChange={(e) => setC({ ...c, fechaPactada: e.target.value })}
                  />
                </Form.Group>
              </div>
              <div className="col-md-4">
                <CampoValor
                  id="compromiso-valor"
                  etiqueta="Valor comprometido *"
                  valor={c.valor}
                  alCambiar={(v) => setC({ ...c, valor: v })}
                />
              </div>
              <div className="col-md-4">
                <Form.Group controlId="compromiso-obs">
                  <Form.Label>Observaciones</Form.Label>
                  <Form.Control
                    maxLength={1000}
                    value={c.observaciones}
                    onChange={(e) => setC({ ...c, observaciones: e.target.value })}
                  />
                </Form.Group>
              </div>
            </>
          )}
          <p className="small text-body-secondary mb-0">
            Las gestiones y los compromisos no modifican la deuda: un compromiso no equivale a un
            pago.
          </p>
        </div>
      )}
    </Dialogo>
  );
}

export function NuevaObligacion({
  unidades,
  alCerrar,
  alGuardar,
}: {
  unidades: UnidadPrivada[];
  alCerrar: () => void;
  alGuardar: (texto: string) => void;
}) {
  const [d, setD] = useState({
    unidadId: '',
    concepto: 'CUOTA_ADMINISTRACION' as ConceptoImputacion,
    periodo: hoy().slice(0, 7),
    descripcion: '',
    fechaEmision: hoy(),
    fechaVencimiento: hoy(),
    valor: '',
  });
  const centavos = centavosDe(d.valor);
  return (
    <Dialogo
      id="titulo-obligacion"
      titulo="Registrar obligación"
      accion="Registrar obligación"
      grande
      alCerrar={alCerrar}
      deshabilitado={centavos == null}
      alEnviar={async () => {
        const o = await carteraApi.crearObligacion({
          ...d,
          descripcion: d.descripcion.trim() || null,
          valor: decimalDe(centavos!),
        });
        alGuardar(`Obligación ${o.numeroVisible} registrada.`);
      }}
    >
      {(errorCampo) => (
        <div className="row g-3">
          <div className="col-md-6">
            <SelectorUnidad
              id="obligacion-unidad"
              unidades={unidades}
              valor={d.unidadId}
              alCambiar={(unidadId) => {
                const cuota = unidades.find((u) => u.id === unidadId)?.cuotaMensual;
                setD({
                  ...d,
                  unidadId,
                  valor:
                    d.valor ||
                    (cuota ? decimalDe(Math.round(Number(cuota) * 100)).replace('.', ',') : ''),
                });
              }}
            />
          </div>
          <div className="col-md-6">
            <Form.Group controlId="obligacion-concepto">
              <Form.Label>Concepto *</Form.Label>
              <Form.Select
                value={d.concepto}
                onChange={(e) => setD({ ...d, concepto: e.target.value as ConceptoImputacion })}
              >
                {CONCEPTOS.filter(([c]) => c !== 'CUOTA_VENCIDA').map(([codigo, nombre]) => (
                  <option key={codigo} value={codigo}>
                    {nombre}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>
          <div className="col-md-3">
            <Form.Group controlId="obligacion-periodo">
              <Form.Label>Periodo *</Form.Label>
              <Form.Control
                type="month"
                required
                value={d.periodo}
                onChange={(e) => setD({ ...d, periodo: e.target.value })}
              />
            </Form.Group>
          </div>
          <div className="col-md-3">
            <Form.Group controlId="obligacion-emision">
              <Form.Label>Emisión *</Form.Label>
              <Form.Control
                type="date"
                required
                value={d.fechaEmision}
                onChange={(e) => setD({ ...d, fechaEmision: e.target.value })}
              />
            </Form.Group>
          </div>
          <div className="col-md-3">
            <Form.Group controlId="obligacion-vence">
              <Form.Label>Vencimiento *</Form.Label>
              <Form.Control
                type="date"
                required
                min={d.fechaEmision}
                value={d.fechaVencimiento}
                onChange={(e) => setD({ ...d, fechaVencimiento: e.target.value })}
                isInvalid={!!errorCampo('fechaVencimiento')}
              />
            </Form.Group>
          </div>
          <div className="col-md-3">
            <CampoValor
              id="obligacion-valor"
              etiqueta="Valor *"
              valor={d.valor}
              alCambiar={(valor) => setD({ ...d, valor })}
            />
          </div>
          <div className="col-12">
            <Form.Group controlId="obligacion-descripcion">
              <Form.Label>Descripción</Form.Label>
              <Form.Control
                maxLength={300}
                value={d.descripcion}
                onChange={(e) => setD({ ...d, descripcion: e.target.value })}
              />
            </Form.Group>
          </div>
          <p className="small text-body-secondary mb-0">
            Una obligación registrada no se edita ni se borra: se corrige con un ajuste autorizado.
          </p>
        </div>
      )}
    </Dialogo>
  );
}

export function GenerarCuotas({
  alCerrar,
  alGuardar,
}: {
  alCerrar: () => void;
  alGuardar: (texto: string) => void;
}) {
  const mes = hoy().slice(0, 7);
  const [d, setD] = useState({
    periodo: mes,
    fechaEmision: `${mes}-01`,
    fechaVencimiento: `${mes}-10`,
  });
  return (
    <Dialogo
      id="titulo-generar"
      titulo="Generar cuotas de administración"
      accion="Generar cuotas"
      alCerrar={alCerrar}
      alEnviar={async () => {
        const r = await carteraApi.generar(d);
        alGuardar(
          `Se generaron ${r.creadas} cuotas de ${nombrePeriodo(d.periodo)} por ${dinero(r.valor)}.` +
            (r.yaExistian ? ` ${r.yaExistian} unidades ya la tenían.` : '') +
            (r.sinCuota ? ` ${r.sinCuota} unidades no tienen cuota mensual definida.` : ''),
        );
      }}
    >
      {() => (
        <>
          <p>
            Crea la cuota del periodo para cada unidad activa que tenga cuota mensual definida. Las
            unidades que ya la tienen no se repiten.
          </p>
          <div className="row g-3">
            <div className="col-md-4">
              <Form.Group controlId="generar-periodo">
                <Form.Label>Periodo *</Form.Label>
                <Form.Control
                  type="month"
                  required
                  value={d.periodo}
                  onChange={(e) =>
                    setD({
                      periodo: e.target.value,
                      fechaEmision: `${e.target.value}-01`,
                      fechaVencimiento: `${e.target.value}-10`,
                    })
                  }
                />
              </Form.Group>
            </div>
            <div className="col-md-4">
              <Form.Group controlId="generar-emision">
                <Form.Label>Emisión *</Form.Label>
                <Form.Control
                  type="date"
                  required
                  value={d.fechaEmision}
                  onChange={(e) => setD({ ...d, fechaEmision: e.target.value })}
                />
              </Form.Group>
            </div>
            <div className="col-md-4">
              <Form.Group controlId="generar-vence">
                <Form.Label>Vencimiento *</Form.Label>
                <Form.Control
                  type="date"
                  required
                  min={d.fechaEmision}
                  value={d.fechaVencimiento}
                  onChange={(e) => setD({ ...d, fechaVencimiento: e.target.value })}
                />
              </Form.Group>
            </div>
          </div>
        </>
      )}
    </Dialogo>
  );
}

export function SolicitarAjuste({
  obligacion,
  alCerrar,
  alGuardar,
}: {
  obligacion: Pick<Obligacion, 'id' | 'numeroVisible' | 'concepto' | 'periodo' | 'saldo'>;
  alCerrar: () => void;
  alGuardar: (texto: string) => void;
}) {
  const [d, setD] = useState({
    tipo: 'CREDITO' as 'CREDITO' | 'DEBITO',
    valor: '',
    motivo: '',
    soporte: '',
  });
  const centavos = centavosDe(d.valor);
  const excede =
    d.tipo === 'CREDITO' &&
    centavos != null &&
    centavos > Math.round(Number(obligacion.saldo) * 100);
  return (
    <Dialogo
      id="titulo-ajuste"
      titulo={`Solicitar ajuste · ${obligacion.numeroVisible}`}
      accion="Solicitar ajuste"
      alCerrar={alCerrar}
      deshabilitado={centavos == null || excede || d.motivo.trim().length < 10}
      alEnviar={async () => {
        await carteraApi.solicitarAjuste({
          obligacionId: obligacion.id,
          tipo: d.tipo,
          valor: decimalDe(centavos!),
          motivo: d.motivo.trim(),
          soporte: d.soporte.trim() || null,
        });
        alGuardar('Ajuste solicitado. No cambia el saldo hasta que otra persona lo autorice.');
      }}
    >
      {() => (
        <div className="d-flex flex-column gap-3">
          <p className="mb-0">
            {nombreConcepto(obligacion.concepto)} · {nombrePeriodo(obligacion.periodo)} · saldo
            actual <strong>{dinero(obligacion.saldo)}</strong>
          </p>
          <Form.Group controlId="ajuste-tipo">
            <Form.Label>Tipo de ajuste *</Form.Label>
            <Form.Select
              value={d.tipo}
              onChange={(e) => setD({ ...d, tipo: e.target.value as 'CREDITO' | 'DEBITO' })}
            >
              <option value="CREDITO">Crédito: disminuye la deuda</option>
              <option value="DEBITO">Débito: aumenta la deuda</option>
            </Form.Select>
          </Form.Group>
          <CampoValor
            id="ajuste-valor"
            etiqueta="Valor *"
            valor={d.valor}
            alCambiar={(valor) => setD({ ...d, valor })}
          />
          {excede && <Alerta tono="aviso">El crédito no puede superar el saldo pendiente.</Alerta>}
          <Form.Group controlId="ajuste-motivo">
            <Form.Label>Motivo *</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              required
              minLength={10}
              maxLength={1000}
              value={d.motivo}
              onChange={(e) => setD({ ...d, motivo: e.target.value })}
              aria-describedby="ajuste-motivo-ayuda"
            />
            <Form.Text id="ajuste-motivo-ayuda">
              El ajuste requiere motivo y autorización.
            </Form.Text>
          </Form.Group>
          <Form.Group controlId="ajuste-soporte">
            <Form.Label>Soporte (acta, oficio, referencia)</Form.Label>
            <Form.Control
              maxLength={500}
              value={d.soporte}
              onChange={(e) => setD({ ...d, soporte: e.target.value })}
            />
          </Form.Group>
        </div>
      )}
    </Dialogo>
  );
}
