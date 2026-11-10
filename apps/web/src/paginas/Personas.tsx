import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ACCIONES,
  AREA_CODIGOS,
  AREAS,
  ROLES,
  type Accion,
  type AreaCodigo,
  type Rol,
} from '@zulu/shared';
import { Fragment, useState, type FormEvent } from 'react';
import Badge from 'react-bootstrap/Badge';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';
import { ErrorApi } from '@/api/cliente';
import {
  membresiasApi,
  type Efecto,
  type Membresia,
  type PermisoExplicito,
} from '@/api/membresias';
import { DialogoConfirmacion } from '@/componentes/Dialogo';
import { EstadoVacio } from '@/componentes/dashboard/EstadoVacio';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { Alerta, Boton, Campo, Etiqueta, Selector, Tarjeta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { permisosEfectivos } from '@/permisos/efectivos';
import { NOMBRE_ACCION, NOMBRE_ROL } from '@/permisos/etiquetas';
import { useSesion, useYo } from '@/sesion/SesionProvider';

const AREAS_ORDEN = AREA_CODIGOS;
const mensajeDe = (e: unknown) =>
  e instanceof ErrorApi ? e.message : 'Ocurrió un error inesperado.';

type Confirmacion =
  | { tipo: 'desactivar'; membresia: Membresia }
  | { tipo: 'revocar'; membresia: Membresia; permiso: PermisoExplicito };

export function Personas() {
  useTitulo('Personas y permisos');
  const yo = useYo();
  const { condominioActivo } = useSesion();
  const qc = useQueryClient();
  const clave = ['membresias', condominioActivo?.condominioId];
  const consulta = useQuery({ queryKey: clave, queryFn: membresiasApi.listar });
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'aviso' | 'error'; texto: string } | null>(
    null,
  );
  const [agregando, setAgregando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  const recargar = () => qc.invalidateQueries({ queryKey: clave });
  const alFallar = (e: unknown) => {
    setAviso({ tono: 'error', texto: mensajeDe(e) });
    void recargar();
  };

  const modificar = useMutation({
    mutationFn: (v: { id: string; cambios: { activo?: boolean; rol?: Rol } }) =>
      membresiasApi.modificar(v.id, v.cambios),
    onSuccess: () => recargar(),
    onError: alFallar,
  });
  const revocar = useMutation({
    mutationFn: (permisoId: string) => membresiasApi.revocarPermiso(permisoId),
    onSuccess: () => recargar(),
    onError: alFallar,
  });

  async function confirmar() {
    if (!confirmacion) return;
    setAviso(null);
    try {
      if (confirmacion.tipo === 'desactivar') {
        await modificar.mutateAsync({ id: confirmacion.membresia.id, cambios: { activo: false } });
        setAviso({
          tono: 'ok',
          texto: `${confirmacion.membresia.usuario.nombre} ya no tiene acceso a este condominio.`,
        });
      } else {
        await revocar.mutateAsync(confirmacion.permiso.id);
      }
    } finally {
      setConfirmacion(null);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Personas y permisos"
        descripcion={`Quién trabaja en ${condominioActivo?.razonSocial ?? 'el condominio'} y qué puede hacer.`}
        acciones={
          !agregando && (
            <Boton onClick={() => setAgregando(true)}>
              <i className="bi bi-person-plus" aria-hidden="true" />
              Agregar persona
            </Boton>
          )
        }
      />

      {aviso && (
        <Alerta tono={aviso.tono} className="mb-4">
          {aviso.texto}
        </Alerta>
      )}

      {agregando && (
        <FormAgregar
          onCancelar={() => setAgregando(false)}
          onListo={(nombre, correoEnviado) => {
            setAgregando(false);
            setAviso(
              correoEnviado === false
                ? {
                    tono: 'aviso',
                    texto: `${nombre} quedó agregada, pero no se pudo enviar el correo. Pídale que use "Olvidé mi contraseña" para definir su clave.`,
                  }
                : correoEnviado
                  ? {
                      tono: 'ok',
                      texto: `${nombre} recibirá un correo para definir su contraseña.`,
                    }
                  : {
                      tono: 'ok',
                      texto: `${nombre} ya tenía cuenta: puede ingresar con su contraseña actual.`,
                    },
            );
            void recargar();
          }}
        />
      )}

      {consulta.isPending ? (
        <Card>
          <Card.Body>
            <p role="status" className="visually-hidden">
              Cargando personas…
            </p>
            <div className="placeholder-glow d-flex flex-column gap-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="placeholder col-12 rounded" style={{ height: '2.5rem' }} />
              ))}
            </div>
          </Card.Body>
        </Card>
      ) : consulta.isError ? (
        <Alerta tono="error">{mensajeDe(consulta.error)}</Alerta>
      ) : consulta.data.length === 0 ? (
        <Card>
          <EstadoVacio
            icono="bi-people"
            titulo="Aún no hay personas"
            accion={<Boton onClick={() => setAgregando(true)}>Agregar persona</Boton>}
          >
            Agregue a su equipo para que pueda ingresar a este condominio.
          </EstadoVacio>
        </Card>
      ) : (
        <Card>
          <Table responsive hover className="align-middle mb-0">
            <caption className="visually-hidden">Personas con acceso al condominio</caption>
            <thead className="table-light">
              <tr>
                <th scope="col" className="ps-4">
                  Persona
                </th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col" className="pe-4">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.map((m) => {
                const propia = m.usuario.id === yo.id;
                const expandida = abierta === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr>
                      <td className="ps-4">
                        <div className="d-flex align-items-center gap-3">
                          <span className="avatar" aria-hidden="true">
                            {iniciales(m.usuario.nombre)}
                          </span>
                          <div className="min-w-0">
                            <p className="mb-0 fw-semibold">{m.usuario.nombre}</p>
                            <p className="mb-0 small text-body-secondary text-break">
                              {m.usuario.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td style={{ minWidth: '14rem' }}>
                        {propia ? (
                          NOMBRE_ROL[m.rol]
                        ) : (
                          <Form.Select
                            size="sm"
                            aria-label={`Rol de ${m.usuario.nombre}`}
                            value={m.rol}
                            disabled={modificar.isPending}
                            onChange={(e) =>
                              modificar.mutate({
                                id: m.id,
                                cambios: { rol: e.target.value as Rol },
                              })
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {NOMBRE_ROL[r]}
                              </option>
                            ))}
                          </Form.Select>
                        )}
                      </td>
                      <td>
                        {m.activo ? (
                          <Etiqueta tono="ok">Activa</Etiqueta>
                        ) : (
                          <Etiqueta tono="aviso">Inactiva</Etiqueta>
                        )}
                      </td>
                      <td className="pe-4">
                        <div className="d-flex justify-content-end gap-2">
                          <Boton
                            variante="secundario"
                            className="btn-sm"
                            aria-expanded={expandida}
                            aria-controls={`permisos-${m.id}`}
                            onClick={() => setAbierta(expandida ? null : m.id)}
                          >
                            <i
                              className={`bi ${expandida ? 'bi-chevron-up' : 'bi-shield-check'}`}
                              aria-hidden="true"
                            />
                            Permisos
                          </Boton>
                          {!propia &&
                            (m.activo ? (
                              <Boton
                                variante="secundario"
                                className="btn-sm"
                                onClick={() =>
                                  setConfirmacion({ tipo: 'desactivar', membresia: m })
                                }
                              >
                                Desactivar
                              </Boton>
                            ) : (
                              <Boton
                                variante="secundario"
                                className="btn-sm"
                                onClick={() =>
                                  modificar.mutate({ id: m.id, cambios: { activo: true } })
                                }
                              >
                                Reactivar
                              </Boton>
                            ))}
                        </div>
                      </td>
                    </tr>
                    {expandida && (
                      <tr id={`permisos-${m.id}`}>
                        <td colSpan={4} className="bg-body-tertiary px-4 py-4">
                          <PanelPermisos
                            membresia={m}
                            onCambio={recargar}
                            onError={alFallar}
                            onRevocar={(permiso) =>
                              setConfirmacion({ tipo: 'revocar', membresia: m, permiso })
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <DialogoConfirmacion
        abierto={confirmacion !== null}
        titulo={
          confirmacion?.tipo === 'desactivar'
            ? `Desactivar a ${confirmacion.membresia.usuario.nombre}`
            : 'Revocar permiso'
        }
        textoConfirmar={confirmacion?.tipo === 'desactivar' ? 'Sí, desactivar' : 'Sí, revocar'}
        peligro
        cargando={modificar.isPending || revocar.isPending}
        onConfirmar={() => void confirmar()}
        onCerrar={() => setConfirmacion(null)}
      >
        {confirmacion?.tipo === 'desactivar' ? (
          <p className="mb-0">
            Perderá el acceso a este condominio de inmediato. Puede reactivarla después.
          </p>
        ) : confirmacion ? (
          <p className="mb-0">
            Se revocará “{describirPermiso(confirmacion.permiso)}” de{' '}
            {confirmacion.membresia.usuario.nombre}.
          </p>
        ) : null}
      </DialogoConfirmacion>
    </>
  );
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

function describirPermiso(p: PermisoExplicito) {
  const accion = NOMBRE_ACCION[p.accion];
  const tipo = p.efecto === 'CONCEDER' ? 'Concedido' : 'Restringido';
  const alcance = p.expedienteId ? ` · expediente ${p.expedienteId.slice(0, 8)}…` : '';
  return `${tipo}: ${accion} en ${p.area} ${AREAS[p.area]}${alcance}`;
}

function FormAgregar({
  onCancelar,
  onListo,
}: {
  onCancelar: () => void;
  onListo: (nombre: string, correoEnviado: boolean | null) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Rol>('ASISTENTE');
  const [error, setError] = useState<ErrorApi | null>(null);
  const crear = useMutation({ mutationFn: membresiasApi.crear });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await crear.mutateAsync({ nombre: nombre.trim(), email: email.trim(), rol });
      onListo(nombre.trim(), r.correoEnviado);
    } catch (err) {
      setError(err instanceof ErrorApi ? err : new ErrorApi(0, mensajeDe(err)));
    }
  }

  return (
    <Tarjeta className="mb-4">
      <h2 className="h5 mb-3">Agregar persona</h2>
      <Form onSubmit={enviar} noValidate>
        {error && !error.errores && (
          <Alerta tono="error" className="mb-3">
            {error.message}
          </Alerta>
        )}
        <Row className="g-3">
          <Col md={4}>
            <Campo
              etiqueta="Nombre completo"
              required
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              error={error?.deCampo('nombre')}
            />
          </Col>
          <Col md={4}>
            <Campo
              etiqueta="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error?.deCampo('email')}
            />
          </Col>
          <Col md={4}>
            <Selector
              etiqueta="Rol"
              value={rol}
              onChange={(e) => setRol(e.target.value as Rol)}
              error={error?.deCampo('rol')}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_ROL[r]}
                </option>
              ))}
            </Selector>
          </Col>
        </Row>
        <div className="d-flex gap-2 mt-4">
          <Boton type="submit" cargando={crear.isPending} disabled={!nombre || !email}>
            Guardar persona
          </Boton>
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        </div>
      </Form>
    </Tarjeta>
  );
}

function PanelPermisos({
  membresia,
  onCambio,
  onError,
  onRevocar,
}: {
  membresia: Membresia;
  onCambio: () => unknown;
  onError: (e: unknown) => void;
  onRevocar: (p: PermisoExplicito) => void;
}) {
  const [area, setArea] = useState<AreaCodigo>('01');
  const [accion, setAccion] = useState<Accion>('leer');
  const [expediente, setExpediente] = useState('');
  const crear = useMutation({
    mutationFn: (efecto: Efecto) =>
      membresiasApi.crearPermiso(membresia.id, {
        area,
        accion,
        efecto,
        expedienteId: expediente.trim() || undefined,
      }),
    onSuccess: () => {
      setExpediente('');
      return onCambio();
    },
    onError,
  });

  return (
    <section aria-label={`Permisos de ${membresia.usuario.nombre}`}>
      <Row className="g-4">
        <Col xl={7}>
          <h3 className="h6 mb-2">
            Permisos efectivos ({NOMBRE_ROL[membresia.rol]} + excepciones)
          </h3>
          <Table size="sm" className="align-middle mb-0 bg-transparent">
            <caption className="visually-hidden">Permisos efectivos por área</caption>
            <tbody>
              {AREAS_ORDEN.map((a) => {
                const efectivos = permisosEfectivos(membresia.rol, a, membresia.permisos);
                return (
                  <tr key={a}>
                    <th scope="row" className="fw-normal bg-transparent">
                      <span className="tabular text-body-secondary">{a}</span> {AREAS[a]}
                    </th>
                    <td className="bg-transparent">
                      {efectivos.length === 0 ? (
                        <span className="text-body-secondary small">Sin acceso</span>
                      ) : (
                        <div className="d-flex flex-wrap gap-1">
                          {efectivos.map((e) => (
                            <Badge
                              key={e.accion}
                              bg=""
                              className={
                                e.origen === 'concedido'
                                  ? 'bg-success-subtle text-success-emphasis border border-success-subtle'
                                  : 'bg-primary-subtle text-primary-emphasis'
                              }
                            >
                              {e.origen === 'concedido'
                                ? `${NOMBRE_ACCION[e.accion]} (concedido)`
                                : NOMBRE_ACCION[e.accion]}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Col>
        <Col xl={5}>
          <h3 className="h6 mb-2">Excepciones</h3>
          {membresia.permisos.length === 0 ? (
            <p className="small text-body-secondary">
              Sin excepciones: aplica solo la matriz del rol.
            </p>
          ) : (
            <ul className="list-group mb-3">
              {membresia.permisos.map((p) => (
                <li
                  key={p.id}
                  className="list-group-item d-flex flex-wrap align-items-center gap-2 small"
                >
                  <Etiqueta tono={p.efecto === 'CONCEDER' ? 'ok' : 'aviso'}>
                    {p.efecto === 'CONCEDER' ? 'Concedido' : 'Restringido'}
                  </Etiqueta>
                  <span className="flex-grow-1">{describirPermiso(p).split(': ')[1]}</span>
                  <Boton
                    variante="enlace"
                    className="small"
                    aria-label={`Revocar ${describirPermiso(p)}`}
                    onClick={() => onRevocar(p)}
                  >
                    Revocar
                  </Boton>
                </li>
              ))}
            </ul>
          )}

          <Card className="shadow-none border">
            <Card.Body>
              <h4 className="h6 mb-3">Agregar excepción</h4>
              <Form onSubmit={(e) => e.preventDefault()} className="d-flex flex-column gap-3">
                <Selector
                  etiqueta="Área"
                  value={area}
                  onChange={(e) => setArea(e.target.value as AreaCodigo)}
                >
                  {AREAS_ORDEN.map((a) => (
                    <option key={a} value={a}>
                      {a} {AREAS[a]}
                    </option>
                  ))}
                </Selector>
                <Selector
                  etiqueta="Acción"
                  value={accion}
                  onChange={(e) => setAccion(e.target.value as Accion)}
                >
                  {ACCIONES.map((a) => (
                    <option key={a} value={a}>
                      {NOMBRE_ACCION[a]}
                    </option>
                  ))}
                </Selector>
                <Campo
                  etiqueta="Expediente (opcional)"
                  placeholder="ID del expediente"
                  ayuda="Déjelo vacío para aplicar a toda el área."
                  value={expediente}
                  onChange={(e) => setExpediente(e.target.value)}
                />
                <div className="d-flex gap-2">
                  <Boton
                    cargando={crear.isPending && crear.variables === 'CONCEDER'}
                    onClick={() => crear.mutate('CONCEDER')}
                  >
                    Conceder
                  </Boton>
                  <Boton
                    variante="secundario"
                    cargando={crear.isPending && crear.variables === 'RESTRINGIR'}
                    onClick={() => crear.mutate('RESTRINGIR')}
                  >
                    Restringir
                  </Boton>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </section>
  );
}
