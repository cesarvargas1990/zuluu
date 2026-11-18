import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';
import { adminApi, type CondominioAdmin, type GrupoAdmin } from '@/api/admin';
import { ErrorApi } from '@/api/cliente';
import { EstadoVacio } from '@/componentes/dashboard/EstadoVacio';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { Alerta, Boton, Campo, Selector, Tarjeta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';

const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });

export function AdminCondominios() {
  useTitulo('Copropiedades');
  const qc = useQueryClient();
  const consulta = useQuery({ queryKey: ['admin', 'condominios'], queryFn: adminApi.condominios });
  const grupos = useQuery({ queryKey: ['admin', 'grupos'], queryFn: adminApi.grupos });
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorAsignar, setErrorAsignar] = useState<string | null>(null);
  const asignar = useMutation({
    mutationFn: (v: { id: string; grupoId: string | null }) =>
      adminApi.asignarGrupo(v.id, v.grupoId),
    onSuccess: () => {
      setErrorAsignar(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'condominios'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'grupos'] });
    },
    onError: (err) =>
      setErrorAsignar(err instanceof ErrorApi ? err.message : 'No se pudo cambiar el condominio.'),
  });

  const botonCrear = (
    <Boton
      onClick={() => {
        setCreando(true);
        setAviso(null);
      }}
    >
      <i className="bi bi-plus-lg" aria-hidden="true" />
      Crear copropiedad
    </Boton>
  );

  return (
    <>
      <PageHeader
        titulo="Copropiedades"
        descripcion="Copropiedades administradas por ZULU, agrupadas por condominio. Cada una tiene sus datos aislados de las demás."
        acciones={!creando && botonCrear}
      />
      {aviso && (
        <Alerta tono="ok" className="mb-4">
          {aviso}
        </Alerta>
      )}
      {creando && (
        <FormCondominio
          grupos={grupos.data ?? []}
          onCancelar={() => setCreando(false)}
          onListo={(nombre) => {
            setCreando(false);
            setAviso(`Se creó ${nombre}. Ya puede asignar roles en Usuarios.`);
            void qc.invalidateQueries({ queryKey: ['admin', 'condominios'] });
          }}
        />
      )}
      {errorAsignar && (
        <Alerta tono="error" className="mb-4">
          {errorAsignar}
        </Alerta>
      )}
      {consulta.isPending ? (
        <p role="status" className="text-body-secondary">
          Cargando copropiedades…
        </p>
      ) : consulta.isError ? (
        <Alerta tono="error">
          {consulta.error instanceof ErrorApi ? consulta.error.message : 'No se pudo cargar.'}
        </Alerta>
      ) : consulta.data.length === 0 ? (
        <Card>
          <EstadoVacio
            icono="bi-buildings"
            titulo="Aún no hay copropiedades"
            accion={!creando && botonCrear}
          >
            Cree la primera copropiedad para poder asignar roles a las personas.
          </EstadoVacio>
        </Card>
      ) : (
        <Card>
          <Table responsive hover className="align-middle mb-0">
            <caption className="visually-hidden">Copropiedades registradas</caption>
            <thead className="table-light">
              <tr>
                <th scope="col" className="ps-4">
                  Razón social
                </th>
                <th scope="col">NIT</th>
                <th scope="col">Condominio</th>
                <th scope="col" className="pe-4">
                  Creado
                </th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.map((c) => (
                <tr key={c.id}>
                  <td className="ps-4 fw-semibold">{c.razonSocial}</td>
                  <td className="tabular">{c.nit}</td>
                  <td>
                    <Form.Select
                      size="sm"
                      aria-label={`Condominio de ${c.razonSocial}`}
                      value={c.grupoId ?? ''}
                      disabled={asignar.isPending}
                      onChange={(e) =>
                        asignar.mutate({ id: c.id, grupoId: e.target.value || null })
                      }
                    >
                      <option value="">Sin condominio</option>
                      {(grupos.data ?? opcionesDe(c)).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.nombre}
                        </option>
                      ))}
                    </Form.Select>
                  </td>
                  <td className="pe-4 text-body-secondary">{fecha.format(new Date(c.creadoEn))}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

/** Mientras cargan los condominios, al menos muestra el de la fila. */
const opcionesDe = (c: CondominioAdmin): Pick<GrupoAdmin, 'id' | 'nombre'>[] =>
  c.grupoId && c.grupoNombre ? [{ id: c.grupoId, nombre: c.grupoNombre }] : [];

function FormCondominio({
  grupos,
  onCancelar,
  onListo,
}: {
  grupos: GrupoAdmin[];
  onCancelar: () => void;
  onListo: (nombre: string) => void;
}) {
  const [razonSocial, setRazonSocial] = useState('');
  const [nit, setNit] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [error, setError] = useState<ErrorApi | null>(null);
  const crear = useMutation({ mutationFn: adminApi.crearCondominio });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const c = await crear.mutateAsync({
        razonSocial: razonSocial.trim(),
        nit: nit.trim(),
        grupoId: grupoId || null,
      });
      onListo(c.razonSocial);
    } catch (err) {
      setError(err instanceof ErrorApi ? err : new ErrorApi(0, 'No se pudo crear la copropiedad.'));
    }
  }

  return (
    <Tarjeta className="mb-4">
      <h2 className="h5 mb-3">Crear copropiedad</h2>
      <Form onSubmit={enviar} noValidate>
        {error && !error.errores && (
          <Alerta tono="error" className="mb-3">
            {error.message}
          </Alerta>
        )}
        <Row className="g-3">
          <Col md={8}>
            <Campo
              etiqueta="Razón social"
              required
              autoFocus
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              error={error?.deCampo('razonSocial')}
            />
          </Col>
          <Col md={4}>
            <Campo
              etiqueta="NIT"
              required
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              error={error?.deCampo('nit')}
              ayuda="Con dígito de verificación, p. ej. 900123456-7"
            />
          </Col>
          <Col md={12}>
            <Selector
              etiqueta="Condominio"
              value={grupoId}
              onChange={(e) => setGrupoId(e.target.value)}
            >
              <option value="">Sin condominio (se puede asignar después)</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </Selector>
          </Col>
        </Row>
        <div className="d-flex gap-2 mt-4">
          <Boton type="submit" cargando={crear.isPending} disabled={!razonSocial || !nit}>
            Guardar copropiedad
          </Boton>
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        </div>
      </Form>
    </Tarjeta>
  );
}
