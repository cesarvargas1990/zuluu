import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import Table from 'react-bootstrap/Table';
import { recaudosApi, type ResultadoFila, type VistaImportacion } from '@/api/recaudos';
import { Alerta, Boton, Etiqueta } from '@/componentes/ui';
import { dinero, fecha, nombreMedio } from './formato';

const sinAnimacion = import.meta.env.MODE === 'test';
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error inesperado.');
const sinTildes = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Campo del pago → etiqueta, si es obligatorio y encabezados que se reconocen solos. */
const CAMPOS: readonly [string, string, boolean, string[]][] = [
  ['fechaPago', 'Fecha del pago', true, ['fecha', 'fecha pago', 'fecha de pago', 'fecha del pago']],
  ['valor', 'Valor', true, ['valor', 'monto', 'valor recibido', 'valor pagado', 'importe']],
  ['medio', 'Medio de pago', true, ['medio', 'medio de pago', 'forma de pago']],
  [
    'unidad',
    'Villa o lote',
    false,
    ['unidad', 'codigo', 'codigo unidad', 'villa', 'lote', 'inmueble'],
  ],
  ['referencia', 'Referencia', false, ['referencia', 'ref', 'numero de operacion', 'comprobante']],
  ['pagador', 'Pagador', false, ['pagador', 'nombre', 'consignante', 'ordenante']],
  ['banco', 'Banco u origen', false, ['banco', 'origen', 'entidad']],
  ['observacion', 'Observaciones', false, ['observacion', 'observaciones', 'nota', 'detalle']],
];

const RESULTADO: Record<ResultadoFila, { texto: string; tono: 'ok' | 'aviso' | 'error' | 'info' }> =
  {
    VALIDA: { texto: 'Válida', tono: 'ok' },
    ADVERTENCIA: { texto: 'Por identificar', tono: 'info' },
    DUPLICADO: { texto: 'Posible duplicado', tono: 'aviso' },
    ERROR: { texto: 'Con error', tono: 'error' },
  };

interface Libro {
  archivo: string;
  columnas: string[];
  filas: Array<Record<string, string>>;
}

export function ImportarPagos({
  alCerrar,
  alImportar,
}: {
  alCerrar: () => void;
  alImportar: (texto: string) => void;
}) {
  const [libro, setLibro] = useState<Libro | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [vista, setVista] = useState<VistaImportacion | null>(null);
  const [incluirDuplicados, setIncluirDuplicados] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const paso = vista ? 3 : libro ? 2 : 1;

  async function con<T>(accion: () => Promise<T>): Promise<T | undefined> {
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

  async function cargar(archivo: File) {
    const leido = await con(() => recaudosApi.leerArchivo(archivo));
    if (!leido) return;
    const detectado: Record<string, string> = {};
    for (const [campo, , , alias] of CAMPOS) {
      const columna = leido.columnas.find((c) => alias.includes(sinTildes(c)));
      if (columna) detectado[campo] = columna;
    }
    setLibro(leido);
    setMapeo(detectado);
  }

  async function validar() {
    if (!libro) return;
    const columnas = Object.fromEntries(Object.entries(mapeo).filter(([, columna]) => columna));
    const resultado = await con(() =>
      recaudosApi.previsualizarImportacion(libro.archivo, libro.filas, columnas),
    );
    if (resultado) {
      setVista(resultado);
      setIncluirDuplicados(false);
    }
  }

  /** Vuelve al mapeo descartando el borrador guardado en el servidor. */
  async function corregir() {
    if (vista) await con(() => recaudosApi.descartarImportacion(vista.id));
    setVista(null);
  }

  async function cerrar() {
    if (vista) await recaudosApi.descartarImportacion(vista.id).catch(() => undefined);
    alCerrar();
  }

  async function confirmar() {
    if (!vista) return;
    const r = await con(() => recaudosApi.confirmarImportacion(vista.id, incluirDuplicados));
    if (r) {
      alImportar(
        `Se importaron ${r.creados} pagos como pendientes de verificar.${r.omitidos ? ` ${r.omitidos} filas no se importaron.` : ''}`,
      );
    }
  }

  const aImportar = vista
    ? vista.resumen.validas +
      vista.resumen.advertencias +
      (incluirDuplicados ? vista.resumen.duplicados : 0)
    : 0;
  const faltantes = CAMPOS.filter(([campo, , obligatorio]) => obligatorio && !mapeo[campo]).map(
    ([, etiqueta]) => etiqueta,
  );

  return (
    <Modal
      show
      onHide={() => void cerrar()}
      centered
      size="xl"
      backdrop="static"
      animation={!sinAnimacion}
      aria-labelledby="titulo-importar-pagos"
    >
      <Modal.Header closeButton>
        <Modal.Title id="titulo-importar-pagos">Importar pagos desde Excel</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ol className="pasos-importacion list-unstyled d-flex flex-wrap gap-3 mb-4">
          {['Cargar archivo', 'Validar datos', 'Confirmar importación'].map((nombre, i) => (
            <li
              key={nombre}
              className={i + 1 === paso ? 'fw-semibold' : 'text-body-secondary'}
              aria-current={i + 1 === paso ? 'step' : undefined}
            >
              <span
                className={`badge rounded-pill me-2 ${i + 1 <= paso ? 'text-bg-primary' : 'text-bg-light border'}`}
              >
                {i + 1}
              </span>
              {nombre}
            </li>
          ))}
        </ol>
        {error && (
          <Alerta tono="error" className="mb-3">
            {error}
          </Alerta>
        )}

        {paso === 1 && (
          <>
            <Form.Group controlId="importar-archivo" className="mb-3">
              <Form.Label>Archivo con los pagos</Form.Label>
              <Form.Control
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={ocupado}
                onChange={(e) => {
                  const archivo = (e.target as HTMLInputElement).files?.[0];
                  if (archivo) void cargar(archivo);
                }}
                aria-describedby="importar-archivo-ayuda"
              />
              <Form.Text id="importar-archivo-ayuda">
                Excel (.xlsx, .xls) o CSV, hasta 2.000 filas. La primera fila debe tener los nombres
                de las columnas: fecha, valor, medio, unidad, referencia y pagador.
              </Form.Text>
            </Form.Group>
            <a
              className="btn btn-outline-primary btn-sm"
              href={`${import.meta.env.BASE_URL}plantilla-importacion-pagos.xlsx`}
              download
            >
              <i className="bi bi-download me-1" aria-hidden="true" />
              Descargar plantilla
            </a>
            <p className="small text-body-secondary mt-3 mb-0">
              Cargar el archivo no registra nada: primero verá el resultado de la validación fila
              por fila.
            </p>
          </>
        )}

        {paso === 2 && libro && (
          <>
            <p>
              <strong>{libro.archivo}</strong> · {libro.filas.length} filas. Indique qué columna del
              archivo corresponde a cada dato.
            </p>
            <div className="row g-3 mb-3">
              {CAMPOS.map(([campo, etiqueta, obligatorio]) => (
                <div className="col-sm-6 col-lg-3" key={campo}>
                  <Form.Group controlId={`mapeo-${campo}`}>
                    <Form.Label>
                      {etiqueta}
                      {obligatorio ? ' *' : ''}
                    </Form.Label>
                    <Form.Select
                      value={mapeo[campo] ?? ''}
                      onChange={(e) => setMapeo((m) => ({ ...m, [campo]: e.target.value }))}
                    >
                      <option value="">
                        {obligatorio ? 'Seleccione la columna' : 'No está en el archivo'}
                      </option>
                      {libro.columnas.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>
              ))}
            </div>
            {faltantes.length > 0 && (
              <Alerta tono="aviso">Falta indicar la columna de: {faltantes.join(', ')}.</Alerta>
            )}
          </>
        )}

        {paso === 3 && vista && (
          <>
            <div className="row row-cols-2 row-cols-lg-4 g-3 mb-3">
              {(
                [
                  ['Válidas', vista.resumen.validas],
                  ['Por identificar', vista.resumen.advertencias],
                  ['Posibles duplicados', vista.resumen.duplicados],
                  ['Con error', vista.resumen.errores],
                ] as const
              ).map(([etiqueta, cantidad]) => (
                <div className="col" key={etiqueta}>
                  <div className="border rounded p-3 h-100">
                    <p className="small text-body-secondary mb-1">{etiqueta}</p>
                    <p className="h4 mb-0">{cantidad}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="table-responsive mb-3" style={{ maxHeight: '40vh' }}>
              <Table size="sm" className="align-middle">
                <caption className="visually-hidden">Resultado de la validación por fila</caption>
                <thead className="table-light sticky-top">
                  <tr>
                    <th scope="col">Fila</th>
                    <th scope="col">Resultado</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Unidad</th>
                    <th scope="col" className="text-end">
                      Valor
                    </th>
                    <th scope="col">Medio</th>
                    <th scope="col">Referencia</th>
                    <th scope="col">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.filas.map((f) => (
                    <tr key={f.fila}>
                      <td>{f.fila}</td>
                      <td>
                        <Etiqueta tono={RESULTADO[f.resultado].tono}>
                          {RESULTADO[f.resultado].texto}
                        </Etiqueta>
                      </td>
                      <td>{fecha(f.datos.fechaPago)}</td>
                      <td>{f.datos.unidad || '—'}</td>
                      <td className="text-end">{dinero(f.datos.valor)}</td>
                      <td>{f.datos.medio ? nombreMedio(f.datos.medio) : '—'}</td>
                      <td>{f.datos.referencia ?? '—'}</td>
                      <td>{f.mensajes.join('; ') || 'Sin novedades'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {vista.resumen.duplicados > 0 && (
              <Form.Check
                id="importar-duplicados"
                type="checkbox"
                className="mb-2"
                label={`Importar también los ${vista.resumen.duplicados} posibles duplicados (quedarán marcados para revisión)`}
                checked={incluirDuplicados}
                onChange={(e) => setIncluirDuplicados(e.target.checked)}
              />
            )}
            <p className="small text-body-secondary mb-0">
              Las filas con error no se importan: corríjalas en el archivo y cárguelas de nuevo. Los
              pagos importados quedan pendientes de verificar y no afectan la cartera hasta su
              aprobación.
            </p>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={() => void cerrar()}>
          Cancelar
        </Button>
        {paso === 2 && (
          <>
            <Button variant="outline-secondary" onClick={() => setLibro(null)}>
              Elegir otro archivo
            </Button>
            <Boton
              cargando={ocupado}
              disabled={faltantes.length > 0}
              onClick={() => void validar()}
            >
              Validar archivo
            </Boton>
          </>
        )}
        {paso === 3 && (
          <>
            <Button variant="outline-secondary" disabled={ocupado} onClick={() => void corregir()}>
              Volver a las columnas
            </Button>
            <Boton cargando={ocupado} disabled={aImportar === 0} onClick={() => void confirmar()}>
              {aImportar === 0 ? 'No hay filas para importar' : `Importar ${aImportar} pagos`}
            </Boton>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
