import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLES, type Rol } from '@zulu/shared';
import { Fragment, useState, type FormEvent } from 'react';
import Badge from 'react-bootstrap/Badge';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';
import { Link } from 'react-router';
import { adminApi, type CondominioAdmin, type RolNuevo, type UsuarioAdmin } from '@/api/admin';
import { ErrorApi } from '@/api/cliente';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { DialogoConfirmacion } from '@/componentes/Dialogo';
import { Alerta, Boton, Campo, Etiqueta, Selector, Tarjeta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { NOMBRE_ROL } from '@/permisos/etiquetas';
import { useYo } from '@/sesion/SesionProvider';

const CLAVE = ['admin', 'usuarios'];
const mensajeDe = (e: unknown) =>
  e instanceof ErrorApi ? e.message : 'Ocurrió un error inesperado.';
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

type Aviso = { tono: 'ok' | 'aviso' | 'error'; texto: string; reenviarA?: string };

export function AdminUsuarios() {
  useTitulo('Usuarios');
  const yo = useYo();
  const qc = useQueryClient();
  const usuarios = useQuery({ queryKey: CLAVE, queryFn: adminApi.usuarios });
  const condominios = useQuery({
    queryKey: ['admin', 'condominios'],
    queryFn: adminApi.condominios,
  });
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aDesactivar, setADesactivar] = useState<UsuarioAdmin | null>(null);

  const recargar = () => qc.invalidateQueries({ queryKey: CLAVE });
  const alFallar = (e: unknown) => {
    setAviso({ tono: 'error', texto: mensajeDe(e) });
    void recargar();
  };

  const estado = useMutation({
    mutationFn: (v: { id: string; activo: boolean }) => adminApi.cambiarEstado(v.id, v.activo),
    onSuccess: () => recargar(),
    onError: alFallar,
  });
  const reenviar = useMutation({
    mutationFn: (u: UsuarioAdmin) => adminApi.reenviarInvitacion(u.id),
    onSuccess: (r, u) =>
      setAviso(
        r.correoEnviado
          ? { tono: 'ok', texto: `Invitación reenviada a ${u.email}.` }
          : {
              tono: 'aviso',
              texto: `No se pudo enviar el correo a ${u.email}. Revise la configuración de correo del servidor.`,
            },
      ),
    onError: alFallar,
  });

  const listaCondominios = condominios.data ?? [];

  return (
    <>
      <PageHeader
        titulo="Usuarios"
        descripcion="Cree cuentas, envíe la invitación de primer ingreso y asigne roles por condominio."
        acciones={
          !creando && (
            <Boton
              onClick={() => {
                setCreando(true);
                setAviso(null);
              }}
            >
              <i className="bi bi-person-plus" aria-hidden="true" />
              Crear usuario
            </Boton>
          )
        }
      />

      {aviso && (
        <Alerta tono={aviso.tono} className="mb-4">
          {aviso.texto}
        </Alerta>
      )}

      {creando && (
        <FormCrearUsuario
          condominios={listaCondominios}
          onCancelar={() => setCreando(false)}
          onListo={(u, correoEnviado) => {
            setCreando(false);
            setAviso(
              correoEnviado
                ? {
                    tono: 'ok',
                    texto: `Le enviamos a ${u.email} un correo con las instrucciones para su primer ingreso.`,
                  }
                : {
                    tono: 'aviso',
                    texto: `Se creó la cuenta de ${u.nombre}, pero no se pudo enviar el correo. Use "Reenviar invitación" cuando el correo del servidor esté configurado.`,
                  },
            );
            void recargar();
          }}
        />
      )}

      {usuarios.isPending ? (
        <p role="status" className="text-body-secondary">
          Cargando usuarios…
        </p>
      ) : usuarios.isError ? (
        <Alerta tono="error">{mensajeDe(usuarios.error)}</Alerta>
      ) : (
        <Card>
          <Table responsive hover className="align-middle mb-0">
            <caption className="visually-hidden">Usuarios de la plataforma</caption>
            <thead className="table-light">
              <tr>
                <th scope="col" className="ps-4">
                  Usuario
                </th>
                <th scope="col">Roles</th>
                <th scope="col">Estado</th>
                <th scope="col" className="pe-4">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.data.map((u) => {
                const propio = u.id === yo.id;
                const expandido = abierto === u.id;
                return (
                  <Fragment key={u.id}>
                    <tr>
                      <td className="ps-4">
                        <div className="d-flex align-items-center gap-3">
                          <span className="avatar" aria-hidden="true">
                            {iniciales(u.nombre)}
                          </span>
                          <div className="min-w-0">
                            <p className="mb-0 fw-semibold">
                              {u.nombre}
                              {u.esSuperadmin && (
                                <Badge bg="" className="ms-2 bg-dark-subtle text-dark-emphasis">
                                  Superadmin
                                </Badge>
                              )}
                            </p>
                            <p className="mb-0 small text-body-secondary text-break">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {u.roles.length === 0 ? (
                          <span className="small text-body-secondary">
                            {u.esSuperadmin ? 'Todos (administración)' : 'Sin roles'}
                          </span>
                        ) : (
                          <ul className="list-unstyled mb-0 small">
                            {u.roles.map((r) => (
                              <li
                                key={r.membresiaId}
                                className={
                                  r.activo ? '' : 'text-body-secondary text-decoration-line-through'
                                }
                              >
                                {r.razonSocial} · {NOMBRE_ROL[r.rol]}
                                {!r.activo && <span className="visually-hidden"> (inactivo)</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        {!u.activo ? (
                          <Etiqueta tono="aviso">Inactivo</Etiqueta>
                        ) : u.invitacionPendiente ? (
                          <Etiqueta tono="info">Invitación pendiente</Etiqueta>
                        ) : (
                          <Etiqueta tono="ok">Activo</Etiqueta>
                        )}
                      </td>
                      <td className="pe-4">
                        <div className="d-flex flex-wrap justify-content-end gap-2">
                          {!u.esSuperadmin && (
                            <Boton
                              variante="secundario"
                              className="btn-sm"
                              aria-expanded={expandido}
                              aria-controls={`roles-${u.id}`}
                              onClick={() => setAbierto(expandido ? null : u.id)}
                            >
                              <i
                                className={`bi ${expandido ? 'bi-chevron-up' : 'bi-diagram-3'}`}
                                aria-hidden="true"
                              />
                              Roles
                            </Boton>
                          )}
                          {u.activo && u.invitacionPendiente && (
                            <Boton
                              variante="secundario"
                              className="btn-sm"
                              cargando={reenviar.isPending && reenviar.variables?.id === u.id}
                              onClick={() => reenviar.mutate(u)}
                            >
                              Reenviar invitación
                            </Boton>
                          )}
                          {!propio &&
                            (u.activo ? (
                              <Boton
                                variante="secundario"
                                className="btn-sm"
                                onClick={() => setADesactivar(u)}
                              >
                                Desactivar
                              </Boton>
                            ) : (
                              <Boton
                                variante="secundario"
                                className="btn-sm"
                                onClick={() => estado.mutate({ id: u.id, activo: true })}
                              >
                                Reactivar
                              </Boton>
                            ))}
                        </div>
                      </td>
                    </tr>
                    {expandido && (
                      <tr id={`roles-${u.id}`}>
                        <td colSpan={4} className="bg-body-tertiary px-4 py-4">
                          <PanelRoles
                            usuario={u}
                            condominios={listaCondominios}
                            onCambio={recargar}
                            onError={alFallar}
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
        abierto={aDesactivar !== null}
        titulo={`Desactivar a ${aDesactivar?.nombre ?? ''}`}
        textoConfirmar="Sí, desactivar"
        peligro
        cargando={estado.isPending}
        onCerrar={() => setADesactivar(null)}
        onConfirmar={() => {
          if (!aDesactivar) return;
          estado.mutate(
            { id: aDesactivar.id, activo: false },
            { onSettled: () => setADesactivar(null) },
          );
        }}
      >
        <p className="mb-0">
          Perderá el acceso a la plataforma de inmediato y se cerrarán sus sesiones. Puede
          reactivarlo después.
        </p>
      </DialogoConfirmacion>
    </>
  );
}

function FormCrearUsuario({
  condominios,
  onCancelar,
  onListo,
}: {
  condominios: CondominioAdmin[];
  onCancelar: () => void;
  onListo: (u: UsuarioAdmin, correoEnviado: boolean) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<{ condominioId: string; rol: Rol }[]>([
    { condominioId: '', rol: 'ASISTENTE' },
  ]);
  const [error, setError] = useState<ErrorApi | null>(null);
  const crear = useMutation({ mutationFn: adminApi.crearUsuario });

  const cambiarRol = (i: number, cambio: Partial<RolNuevo>) =>
    setRoles((rs) => rs.map((r, j) => (j === i ? { ...r, ...cambio } : r)));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await crear.mutateAsync({
        nombre: nombre.trim(),
        email: email.trim(),
        roles: roles.filter((r) => r.condominioId),
      });
      onListo(r.usuario, r.correoEnviado);
    } catch (err) {
      setError(err instanceof ErrorApi ? err : new ErrorApi(0, mensajeDe(err)));
    }
  }

  return (
    <Tarjeta className="mb-4">
      <h2 className="h5 mb-1">Crear usuario</h2>
      <p className="small text-body-secondary mb-3">
        La persona recibirá un correo con un enlace para definir su contraseña (válido 72 horas) y
        los pasos para su primer ingreso.
      </p>
      <Form onSubmit={enviar} noValidate>
        {error && !error.errores && (
          <Alerta tono="error" className="mb-3">
            {error.message}
          </Alerta>
        )}
        <Row className="g-3">
          <Col md={6}>
            <Campo
              etiqueta="Nombre completo"
              required
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              error={error?.deCampo('nombre')}
            />
          </Col>
          <Col md={6}>
            <Campo
              etiqueta="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error?.deCampo('email')}
            />
          </Col>
        </Row>

        <h3 className="h6 mt-4 mb-2">Roles por condominio</h3>
        {condominios.length === 0 ? (
          <p className="small text-body-secondary">
            Aún no hay condominios. Puede crear el usuario sin rol y asignarlo después, o{' '}
            <Link to="/admin/condominios">crear un condominio</Link>.
          </p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {roles.map((r, i) => (
              <Row key={i} className="g-2 align-items-end">
                <Col sm={6}>
                  <Selector
                    etiqueta="Condominio"
                    aria-label={`Condominio del rol ${i + 1}`}
                    value={r.condominioId}
                    onChange={(e) => cambiarRol(i, { condominioId: e.target.value })}
                  >
                    <option value="">Sin asignar</option>
                    {condominios.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razonSocial}
                      </option>
                    ))}
                  </Selector>
                </Col>
                <Col sm={4}>
                  <Selector
                    etiqueta="Rol"
                    aria-label={`Rol ${i + 1}`}
                    value={r.rol}
                    onChange={(e) => cambiarRol(i, { rol: e.target.value as Rol })}
                  >
                    {ROLES.map((x) => (
                      <option key={x} value={x}>
                        {NOMBRE_ROL[x]}
                      </option>
                    ))}
                  </Selector>
                </Col>
                <Col sm={2}>
                  {roles.length > 1 && (
                    <Boton
                      variante="secundario"
                      aria-label={`Quitar rol ${i + 1}`}
                      onClick={() => setRoles((rs) => rs.filter((_, j) => j !== i))}
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </Boton>
                  )}
                </Col>
              </Row>
            ))}
            <Boton
              variante="enlace"
              className="align-self-start"
              onClick={() => setRoles((rs) => [...rs, { condominioId: '', rol: 'ASISTENTE' }])}
            >
              <i className="bi bi-plus" aria-hidden="true" /> Agregar otro rol
            </Boton>
          </div>
        )}

        <div className="d-flex gap-2 mt-4">
          <Boton type="submit" cargando={crear.isPending} disabled={!nombre || !email}>
            <i className="bi bi-send" aria-hidden="true" />
            Crear y enviar invitación
          </Boton>
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        </div>
      </Form>
    </Tarjeta>
  );
}

function PanelRoles({
  usuario,
  condominios,
  onCambio,
  onError,
}: {
  usuario: UsuarioAdmin;
  condominios: CondominioAdmin[];
  onCambio: () => unknown;
  onError: (e: unknown) => void;
}) {
  const [condominioId, setCondominioId] = useState('');
  const [rol, setRol] = useState<Rol>('ASISTENTE');
  const asignar = useMutation({
    mutationFn: () => adminApi.asignarRol(usuario.id, { condominioId, rol }),
    onSuccess: () => {
      setCondominioId('');
      return onCambio();
    },
    onError,
  });
  const modificar = useMutation({
    mutationFn: (v: { membresiaId: string; condominioId: string; rol?: Rol; activo?: boolean }) =>
      adminApi.modificarMembresia(v.membresiaId, {
        condominioId: v.condominioId,
        rol: v.rol,
        activo: v.activo,
      }),
    onSuccess: () => onCambio(),
    onError,
  });

  return (
    <section aria-label={`Roles de ${usuario.nombre}`}>
      <Row className="g-4">
        <Col lg={7}>
          <h3 className="h6 mb-2">Roles actuales</h3>
          {usuario.roles.length === 0 ? (
            <p className="small text-body-secondary">
              Sin roles: la persona puede ingresar pero no verá ningún condominio.
            </p>
          ) : (
            <ul className="list-group">
              {usuario.roles.map((r) => (
                <li
                  key={r.membresiaId}
                  className="list-group-item d-flex flex-wrap align-items-center gap-2"
                >
                  <span className="fw-semibold flex-grow-1">{r.razonSocial}</span>
                  <Form.Select
                    size="sm"
                    style={{ maxWidth: '15rem' }}
                    aria-label={`Rol en ${r.razonSocial}`}
                    value={r.rol}
                    disabled={modificar.isPending}
                    onChange={(e) =>
                      modificar.mutate({
                        membresiaId: r.membresiaId,
                        condominioId: r.condominioId,
                        rol: e.target.value as Rol,
                      })
                    }
                  >
                    {ROLES.map((x) => (
                      <option key={x} value={x}>
                        {NOMBRE_ROL[x]}
                      </option>
                    ))}
                  </Form.Select>
                  {r.activo ? (
                    <Etiqueta tono="ok">Activo</Etiqueta>
                  ) : (
                    <Etiqueta tono="aviso">Inactivo</Etiqueta>
                  )}
                  <Boton
                    variante="enlace"
                    className="small"
                    onClick={() =>
                      modificar.mutate({
                        membresiaId: r.membresiaId,
                        condominioId: r.condominioId,
                        activo: !r.activo,
                      })
                    }
                  >
                    {r.activo ? 'Quitar acceso' : 'Reactivar'}
                  </Boton>
                </li>
              ))}
            </ul>
          )}
        </Col>
        <Col lg={5}>
          <Card className="shadow-none border">
            <Card.Body>
              <h4 className="h6 mb-3">Asignar rol</h4>
              {condominios.length === 0 ? (
                <p className="small text-body-secondary mb-0">
                  Primero <Link to="/admin/condominios">cree un condominio</Link>.
                </p>
              ) : (
                <Form
                  onSubmit={(e) => {
                    e.preventDefault();
                    asignar.mutate();
                  }}
                  className="d-flex flex-column gap-3"
                >
                  <Selector
                    etiqueta="Condominio"
                    value={condominioId}
                    onChange={(e) => setCondominioId(e.target.value)}
                  >
                    <option value="">Elija un condominio</option>
                    {condominios.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razonSocial}
                      </option>
                    ))}
                  </Selector>
                  <Selector
                    etiqueta="Rol"
                    value={rol}
                    onChange={(e) => setRol(e.target.value as Rol)}
                  >
                    {ROLES.map((x) => (
                      <option key={x} value={x}>
                        {NOMBRE_ROL[x]}
                      </option>
                    ))}
                  </Selector>
                  <Boton type="submit" cargando={asignar.isPending} disabled={!condominioId}>
                    Asignar rol
                  </Boton>
                </Form>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </section>
  );
}
