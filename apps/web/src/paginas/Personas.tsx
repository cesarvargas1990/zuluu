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
import { ErrorApi } from '@/api/cliente';
import {
  membresiasApi,
  type Efecto,
  type Membresia,
  type PermisoExplicito,
} from '@/api/membresias';
import { DialogoConfirmacion } from '@/componentes/Dialogo';
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Personas y permisos</h1>
          <p className="mt-1 text-texto-suave">
            Quién trabaja en {condominioActivo?.razonSocial} y qué puede hacer.
          </p>
        </div>
        {!agregando && <Boton onClick={() => setAgregando(true)}>Agregar persona</Boton>}
      </div>

      {aviso && <Alerta tono={aviso.tono}>{aviso.texto}</Alerta>}

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
        <p role="status" className="text-texto-suave">
          Cargando personas…
        </p>
      ) : consulta.isError ? (
        <Alerta tono="error">{mensajeDe(consulta.error)}</Alerta>
      ) : (
        <Tarjeta className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Personas con acceso al condominio</caption>
            <thead className="bg-fondo">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Persona
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Rol
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.map((m) => {
                const propia = m.usuario.id === yo.id;
                const expandida = abierta === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr className="border-t border-borde align-middle">
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.usuario.nombre}</p>
                        <p className="text-texto-suave">{m.usuario.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {propia ? (
                          NOMBRE_ROL[m.rol]
                        ) : (
                          <label>
                            <span className="sr-only">Rol de {m.usuario.nombre}</span>
                            <select
                              value={m.rol}
                              disabled={modificar.isPending}
                              onChange={(e) =>
                                modificar.mutate({
                                  id: m.id,
                                  cambios: { rol: e.target.value as Rol },
                                })
                              }
                              className="min-h-10 rounded-md border border-borde bg-superficie px-2"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {NOMBRE_ROL[r]}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {m.activo ? (
                          <Etiqueta tono="ok">Activa</Etiqueta>
                        ) : (
                          <Etiqueta tono="aviso">Inactiva</Etiqueta>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Boton
                            variante="secundario"
                            aria-expanded={expandida}
                            aria-controls={`permisos-${m.id}`}
                            onClick={() => setAbierta(expandida ? null : m.id)}
                          >
                            Permisos
                          </Boton>
                          {!propia &&
                            (m.activo ? (
                              <Boton
                                variante="secundario"
                                onClick={() =>
                                  setConfirmacion({ tipo: 'desactivar', membresia: m })
                                }
                              >
                                Desactivar
                              </Boton>
                            ) : (
                              <Boton
                                variante="secundario"
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
                        <td colSpan={4} className="bg-fondo px-4 py-4">
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
          </table>
        </Tarjeta>
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
          <p>Perderá el acceso a este condominio de inmediato. Puede reactivarla después.</p>
        ) : confirmacion ? (
          <p>
            Se revocará “{describirPermiso(confirmacion.permiso)}” de{' '}
            {confirmacion.membresia.usuario.nombre}.
          </p>
        ) : null}
      </DialogoConfirmacion>
    </div>
  );
}

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
    <Tarjeta>
      <h2 className="text-lg font-semibold">Agregar persona</h2>
      <form onSubmit={enviar} noValidate className="mt-4 grid gap-4 sm:grid-cols-3">
        {error && !error.errores && (
          <Alerta tono="error" className="sm:col-span-3">
            {error.message}
          </Alerta>
        )}
        <Campo
          etiqueta="Nombre completo"
          required
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={error?.deCampo('nombre')}
        />
        <Campo
          etiqueta="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error?.deCampo('email')}
        />
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
        <div className="flex gap-3 sm:col-span-3">
          <Boton type="submit" cargando={crear.isPending} disabled={!nombre || !email}>
            Guardar persona
          </Boton>
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        </div>
      </form>
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
    <section aria-label={`Permisos de ${membresia.usuario.nombre}`} className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="mb-2 text-left font-semibold">
            Permisos efectivos ({NOMBRE_ROL[membresia.rol]} + excepciones)
          </caption>
          <tbody>
            {AREAS_ORDEN.map((a) => {
              const efectivos = permisosEfectivos(membresia.rol, a, membresia.permisos);
              return (
                <tr key={a} className="border-t border-borde/60">
                  <th scope="row" className="py-1.5 pr-4 font-normal">
                    <span className="tabular-nums text-texto-suave">{a}</span> {AREAS[a]}
                  </th>
                  <td className="py-1.5">
                    {efectivos.length === 0 ? (
                      <span className="text-texto-suave">Sin acceso</span>
                    ) : (
                      efectivos
                        .map((e) =>
                          e.origen === 'concedido'
                            ? `${NOMBRE_ACCION[e.accion]} (concedido)`
                            : NOMBRE_ACCION[e.accion],
                        )
                        .join(', ')
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-semibold">Excepciones</h3>
        {membresia.permisos.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Sin excepciones: aplica solo la matriz del rol.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {membresia.permisos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                <Etiqueta tono={p.efecto === 'CONCEDER' ? 'ok' : 'aviso'}>
                  {p.efecto === 'CONCEDER' ? 'Concedido' : 'Restringido'}
                </Etiqueta>
                <span>{describirPermiso(p).split(': ')[1]}</span>
                <Boton
                  variante="enlace"
                  aria-label={`Revocar ${describirPermiso(p)}`}
                  onClick={() => onRevocar(p)}
                >
                  Revocar
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => e.preventDefault()}
        className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr_auto]"
      >
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
          value={expediente}
          onChange={(e) => setExpediente(e.target.value)}
        />
        <div className="flex gap-2">
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
      </form>
    </section>
  );
}
