import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { EstadoVacio } from '@/componentes/dashboard/EstadoVacio';
import {
  aprobarSaldos,
  descargarCartera,
  obtenerCartera,
  previsualizarSaldos,
  type ObligacionCartera,
} from '@/api/cartera';

const dinero = (n: string | number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n));
const tramoLabel: Record<string, string> = {
  CORRIENTE: 'Corriente',
  '01_30': '1–30 días',
  '31_60': '31–60 días',
  '61_90': '61–90 días',
  MAS_90: 'Más de 90 días',
};
const estadoVariant: Record<string, string> = {
  PAGADA: 'success',
  PARCIAL: 'warning',
  VENCIDA: 'danger',
  PENDIENTE: 'secondary',
};
export function Cartera() {
  const [f, setF] = useState({
    buscar: '',
    estado: '',
    periodoDesde: '',
    periodoHasta: '',
    minimo: '',
    maximo: '',
  });
  const [archivo, setArchivo] = useState<File>();
  const [fechaCorte, setFechaCorte] = useState(new Date().toISOString().slice(0, 10));
  const [importacion, setImportacion] = useState<{
    id: string;
    resumen: { total: number; validas: number; errores: number; valor: string };
  }>();
  const [mensaje, setMensaje] = useState('');
  const qc = useQueryClient();
  const params = useMemo(() => Object.fromEntries(Object.entries(f).filter(([, v]) => v)), [f]);
  const q = useQuery({ queryKey: ['cartera', params], queryFn: () => obtenerCartera(params) });
  const previsualizar = useMutation({
    mutationFn: () =>
      archivo
        ? previsualizarSaldos(archivo, fechaCorte)
        : Promise.reject(new Error('Seleccione un archivo.')),
    onSuccess: (r) => {
      setImportacion(r);
      setMensaje('Importación revisada. Confirme para crear los saldos iniciales.');
    },
    onError: (e) => setMensaje(e instanceof Error ? e.message : 'No se pudo revisar el archivo.'),
  });
  const aprobar = useMutation({
    mutationFn: () => aprobarSaldos(importacion!.id),
    onSuccess: (r) => {
      setImportacion(undefined);
      setMensaje(`${r.filas} saldos iniciales fueron importados.`);
      void qc.invalidateQueries({ queryKey: ['cartera'] });
    },
    onError: (e) =>
      setMensaje(e instanceof Error ? e.message : 'No se pudo aprobar la importación.'),
  });
  const exportar = async (formato: 'excel' | 'pdf') => {
    const blob = await descargarCartera(formato, params);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cartera.${formato === 'excel' ? 'xlsx' : 'pdf'}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const limpiar = () =>
    setF({ buscar: '', estado: '', periodoDesde: '', periodoHasta: '', minimo: '', maximo: '' });
  return (
    <>
      <PageHeader
        titulo="Gestión de cartera"
        descripcion="Obligaciones, saldos vencidos e historial por unidad privada."
        acciones={
          <>
            <Button
              variant="outline-secondary"
              onClick={() => document.getElementById('archivo-saldos')?.click()}
            >
              Importar saldos
            </Button>
            <input
              id="archivo-saldos"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="visually-hidden"
              onChange={(e) => {
                setArchivo(e.target.files?.[0]);
                setImportacion(undefined);
              }}
            />
            <Button
              variant="outline-primary"
              onClick={() => void exportar('excel')}
              disabled={!q.data}
            >
              Excel
            </Button>
            <Button
              variant="outline-primary"
              onClick={() => void exportar('pdf')}
              disabled={!q.data}
            >
              PDF
            </Button>
          </>
        }
      />
      {mensaje && (
        <Alert
          variant={mensaje.includes('No se pudo') ? 'danger' : 'info'}
          dismissible
          onClose={() => setMensaje('')}
        >
          {mensaje}
        </Alert>
      )}
      {archivo && (
        <Card className="mb-3">
          <Card.Body>
            <div className="d-flex flex-wrap align-items-end gap-3">
              <div>
                <strong>{archivo.name}</strong>
                <div className="small text-body-secondary">
                  Columnas requeridas: unidad, periodo, fechaVencimiento, valor
                </div>
              </div>
              <Form.Group>
                <Form.Label>Fecha de corte</Form.Label>
                <Form.Control
                  type="date"
                  value={fechaCorte}
                  onChange={(e) => setFechaCorte(e.target.value)}
                />
              </Form.Group>
              <Button onClick={() => previsualizar.mutate()} disabled={previsualizar.isPending}>
                {previsualizar.isPending ? 'Revisando…' : 'Revisar archivo'}
              </Button>
              {importacion && (
                <>
                  <span>
                    {importacion.resumen.validas}/{importacion.resumen.total} filas válidas ·{' '}
                    {dinero(importacion.resumen.valor)}
                  </span>
                  <Button
                    variant="success"
                    onClick={() => aprobar.mutate()}
                    disabled={importacion.resumen.errores > 0 || aprobar.isPending}
                  >
                    Aprobar e importar
                  </Button>
                </>
              )}
            </div>
          </Card.Body>
        </Card>
      )}
      {q.isError && (
        <Alert variant="danger">No se pudo consultar la cartera. Intente de nuevo.</Alert>
      )}
      <Row className="g-3 mb-4">
        {[
          ['Cartera total', q.data?.resumen.total],
          ['Cartera vencida', q.data?.resumen.vencido],
          ['Obligaciones', q.data?.resumen.obligaciones],
        ].map(([label, val]) => (
          <Col md={4} key={String(label)}>
            <Card className="h-100">
              <Card.Body>
                <div className="text-body-secondary">{label}</div>
                <div className="fs-4 fw-semibold mt-2">
                  {val === undefined ? '—' : label === 'Obligaciones' ? val : dinero(String(val))}
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      <Card className="mb-4">
        <Card.Body>
          <Row className="g-3 align-items-end">
            <Col md={4}>
              <Form.Label>Propietario o unidad</Form.Label>
              <Form.Control
                value={f.buscar}
                onChange={(e) => setF({ ...f, buscar: e.target.value })}
                placeholder="Nombre, villa o lote"
              />
            </Col>
            <Col md={2}>
              <Form.Label>Estado</Form.Label>
              <Form.Select
                value={f.estado}
                onChange={(e) => setF({ ...f, estado: e.target.value })}
              >
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PARCIAL">Parcial</option>
                <option value="VENCIDA">Vencida</option>
                <option value="PAGADA">Pagada</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Label>Periodo desde</Form.Label>
              <Form.Control
                type="month"
                value={f.periodoDesde}
                onChange={(e) => setF({ ...f, periodoDesde: e.target.value })}
              />
            </Col>
            <Col md={2}>
              <Form.Label>Periodo hasta</Form.Label>
              <Form.Control
                type="month"
                value={f.periodoHasta}
                onChange={(e) => setF({ ...f, periodoHasta: e.target.value })}
              />
            </Col>
            <Col md={2}>
              <Button variant="link" onClick={limpiar}>
                Limpiar filtros
              </Button>
            </Col>
            <Col md={2}>
              <Form.Label>Saldo mínimo</Form.Label>
              <Form.Control
                type="number"
                min="0"
                value={f.minimo}
                onChange={(e) => setF({ ...f, minimo: e.target.value })}
              />
            </Col>
            <Col md={2}>
              <Form.Label>Saldo máximo</Form.Label>
              <Form.Control
                type="number"
                min="0"
                value={f.maximo}
                onChange={(e) => setF({ ...f, maximo: e.target.value })}
              />
            </Col>
          </Row>
        </Card.Body>
      </Card>
      <Card>
        <Card.Body>
          <h2 className="h5">Obligaciones por unidad</h2>
          {q.isLoading ? (
            <div className="text-center p-5">
              <Spinner />
              <span className="visually-hidden">Cargando cartera…</span>
            </div>
          ) : !q.data?.obligaciones.length ? (
            <EstadoVacio icono="bi-inbox" titulo="No hay obligaciones">
              No encontramos obligaciones con estos filtros.
            </EstadoVacio>
          ) : (
            <div className="table-responsive">
              <Table hover className="align-middle">
                <thead>
                  <tr>
                    <th>Unidad</th>
                    <th>Propietario</th>
                    <th>Periodo</th>
                    <th>Vencimiento</th>
                    <th>Obligación</th>
                    <th>Saldo</th>
                    <th>Mora</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.obligaciones.map((o: ObligacionCartera) => (
                    <tr key={o.id}>
                      <td>{o.unidad.codigo}</td>
                      <td>
                        {o.propietarios.map((p) => p.nombre).join(', ') || 'Sin titular validado'}
                      </td>
                      <td>{o.periodo}</td>
                      <td>{o.fechaVencimiento}</td>
                      <td>{dinero(o.valor)}</td>
                      <td className="fw-semibold">{dinero(o.saldo)}</td>
                      <td>
                        {o.diasMora > 0 ? `${o.diasMora} días · ${tramoLabel[o.tramo]}` : 'Al día'}
                      </td>
                      <td>
                        <Badge bg={estadoVariant[o.estado] || 'secondary'}>{o.estado}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
      <Card className="mt-4">
        <Card.Body>
          <h2 className="h5">Antigüedad de cartera</h2>
          <Row>
            {Object.entries(q.data?.resumen.porTramo ?? {}).map(([key, val]) => (
              <Col key={key} xs={6} md>
                {tramoLabel[key]}
                <div className="fw-semibold">{dinero(val)}</div>
              </Col>
            ))}
          </Row>
        </Card.Body>
      </Card>
    </>
  );
}
