import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import { adminApi, type GrupoAdmin } from '@/api/admin';
import { ErrorApi } from '@/api/cliente';
import { EstadoVacio } from '@/componentes/dashboard/EstadoVacio';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { Alerta, Boton, Campo, Tarjeta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';

/** "Condominio" = agrupador de copropiedades (multiempresa). Se asignan desde Copropiedades. */
export function AdminGrupos() {
  useTitulo('Condominios');
  const qc = useQueryClient();
  const consulta = useQuery({ queryKey: ['admin', 'grupos'], queryFn: adminApi.grupos });
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const refrescar = () => void qc.invalidateQueries({ queryKey: ['admin', 'grupos'] });

  const botonCrear = (
    <Boton
      onClick={() => {
        setCreando(true);
        setAviso(null);
      }}
    >
      <i className="bi bi-plus-lg" aria-hidden="true" />
      Crear condominio
    </Boton>
  );

  return (
    <>
      <PageHeader
        titulo="Condominios"
        descripcion="Un condominio reúne varias copropiedades. Los permisos siguen siendo por copropiedad."
        acciones={!creando && botonCrear}
      />
      {aviso && (
        <Alerta tono="ok" className="mb-4">
          {aviso}
        </Alerta>
      )}
      {creando && (
        <FormGrupo
          onCancelar={() => setCreando(false)}
          onListo={(nombre) => {
            setCreando(false);
            setAviso(`Se creó ${nombre}. Asígnele copropiedades desde la pantalla Copropiedades.`);
            refrescar();
          }}
        />
      )}
      {consulta.isPending ? (
        <p role="status" className="text-body-secondary">
          Cargando condominios…
        </p>
      ) : consulta.isError ? (
        <Alerta tono="error">
          {consulta.error instanceof ErrorApi ? consulta.error.message : 'No se pudo cargar.'}
        </Alerta>
      ) : consulta.data.length === 0 ? (
        <Card>
          <EstadoVacio
            icono="bi-diagram-3"
            titulo="Aún no hay condominios"
            accion={!creando && botonCrear}
          >
            Cree un condominio (por ejemplo, Majagua Villa Campestre) para agrupar sus
            copropiedades.
          </EstadoVacio>
        </Card>
      ) : (
        <Card>
          <Table responsive hover className="align-middle mb-0">
            <caption className="visually-hidden">Condominios registrados</caption>
            <thead className="table-light">
              <tr>
                <th scope="col" className="ps-4">
                  Condominio
                </th>
                <th scope="col">Copropiedades</th>
                <th scope="col" className="pe-4 text-end">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.map((g) => (
                <FilaGrupo key={g.id} grupo={g} onCambio={refrescar} />
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

function FilaGrupo({ grupo, onCambio }: { grupo: GrupoAdmin; onCambio: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(grupo.nombre);
  const [error, setError] = useState<string | null>(null);
  const renombrar = useMutation({
    mutationFn: (n: string) => adminApi.renombrarGrupo(grupo.id, n),
  });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await renombrar.mutateAsync(nombre.trim());
      setEditando(false);
      onCambio();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo cambiar el nombre.');
    }
  }

  return (
    <tr>
      <td className="ps-4">
        {editando ? (
          <Form onSubmit={guardar} noValidate className="d-flex gap-2 align-items-start">
            <Campo
              etiqueta={`Nuevo nombre de ${grupo.nombre}`}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              error={error ?? undefined}
            />
            <Boton
              type="submit"
              className="btn-sm"
              cargando={renombrar.isPending}
              disabled={!nombre.trim()}
            >
              Guardar nombre
            </Boton>
            <Boton variante="secundario" className="btn-sm" onClick={() => setEditando(false)}>
              Cancelar
            </Boton>
          </Form>
        ) : (
          <span className="fw-semibold">{grupo.nombre}</span>
        )}
      </td>
      <td className="tabular">{grupo.copropiedades}</td>
      <td className="pe-4 text-end">
        {!editando && (
          <Boton
            variante="secundario"
            className="btn-sm"
            aria-label={`Renombrar ${grupo.nombre}`}
            onClick={() => {
              setNombre(grupo.nombre);
              setEditando(true);
            }}
          >
            <i className="bi bi-pencil" aria-hidden="true" />
            Renombrar
          </Boton>
        )}
      </td>
    </tr>
  );
}

function FormGrupo({
  onCancelar,
  onListo,
}: {
  onCancelar: () => void;
  onListo: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<ErrorApi | null>(null);
  const crear = useMutation({ mutationFn: adminApi.crearGrupo });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const g = await crear.mutateAsync(nombre.trim());
      onListo(g.nombre);
    } catch (err) {
      setError(err instanceof ErrorApi ? err : new ErrorApi(0, 'No se pudo crear el condominio.'));
    }
  }

  return (
    <Tarjeta className="mb-4">
      <h2 className="h5 mb-3">Crear condominio</h2>
      <Form onSubmit={enviar} noValidate>
        {error && !error.errores && (
          <Alerta tono="error" className="mb-3">
            {error.message}
          </Alerta>
        )}
        <Campo
          etiqueta="Nombre del condominio"
          required
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={error?.deCampo('nombre')}
          ayuda="Por ejemplo, Majagua Villa Campestre"
        />
        <div className="d-flex gap-2 mt-4">
          <Boton type="submit" cargando={crear.isPending} disabled={!nombre.trim()}>
            Guardar condominio
          </Boton>
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        </div>
      </Form>
    </Tarjeta>
  );
}
