import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import { adminApi, type MotivoMfa, type PoliticaMfa, type UsuarioAdmin } from '@/api/admin';
import { ErrorApi } from '@/api/cliente';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { DialogoConfirmacion } from '@/componentes/Dialogo';
import { Alerta, Etiqueta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { NOMBRE_ROL } from '@/permisos/etiquetas';

const CLAVE_PARAMETROS = ['admin', 'parametros'];
const CLAVE_USUARIOS = ['admin', 'usuarios'];
const mensajeDe = (e: unknown) =>
  e instanceof ErrorApi ? e.message : 'Ocurrió un error inesperado.';
const fechaHora = (v: string) =>
  new Date(v).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

const OPCIONES: readonly [PoliticaMfa, string][] = [
  ['HEREDAR', 'Según su rol'],
  ['OBLIGATORIO', 'Exigir siempre'],
  ['NO_REQUERIDO', 'No exigir'],
];

const MOTIVO: Record<MotivoMfa, string> = {
  GLOBAL_APAGADO: 'Sin efecto: el control general está apagado',
  USUARIO_OBLIGATORIO: 'Lo exige el ajuste de esta persona',
  USUARIO_EXENTO: 'Exenta por el ajuste de esta persona',
  ROL: 'Lo exige su rol',
  NINGUNO: 'Su rol no lo exige',
};

type Aviso = { tono: 'ok' | 'error'; texto: string };

export function AdminParametros() {
  useTitulo('Parámetros generales');
  const qc = useQueryClient();
  const parametros = useQuery({ queryKey: CLAVE_PARAMETROS, queryFn: adminApi.parametros });
  const usuarios = useQuery({ queryKey: CLAVE_USUARIOS, queryFn: adminApi.usuarios });
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [apagando, setApagando] = useState(false);

  const global = parametros.data?.mfa.global;
  const recargar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: CLAVE_PARAMETROS }),
      qc.invalidateQueries({ queryKey: CLAVE_USUARIOS }),
    ]);

  const cambiarGlobal = useMutation({
    mutationFn: (activo: boolean) => adminApi.cambiarMfaGlobal(activo),
    onSuccess: (r) => {
      setApagando(false);
      setAviso({
        tono: 'ok',
        texto: r.global
          ? 'Verificación en dos pasos activada. Se aplica según el ajuste de cada persona.'
          : 'Verificación en dos pasos desactivada para todo el sistema.',
      });
      void recargar();
    },
    onError: (e) => {
      setApagando(false);
      setAviso({ tono: 'error', texto: mensajeDe(e) });
    },
  });
  const cambiarUsuario = useMutation({
    mutationFn: (v: { u: UsuarioAdmin; politica: PoliticaMfa }) =>
      adminApi.cambiarMfaUsuario(v.u.id, v.politica),
    onSuccess: (_r, v) => {
      setAviso({
        tono: 'ok',
        texto: `Se guardó el ajuste de ${v.u.nombre}.`,
      });
      void recargar();
    },
    onError: (e) => {
      setAviso({ tono: 'error', texto: mensajeDe(e) });
      void recargar();
    },
  });

  return (
    <>
      <PageHeader
        titulo="Parámetros generales"
        descripcion="Reglas de seguridad que aplican a todo el sistema."
      />
      {aviso && (
        <Alerta tono={aviso.tono} className="mb-3">
          {aviso.texto}
        </Alerta>
      )}
      {parametros.isError && (
        <Alerta tono="error" className="mb-3">
          {mensajeDe(parametros.error)}
        </Alerta>
      )}

      <Card className="mb-4">
        <Card.Body>
          <h2 className="h5">Verificación en dos pasos (2FA)</h2>
          <p className="text-body-secondary">
            Con el control encendido, cada persona usa un código de su aplicación de autenticación
            además de la contraseña, según su ajuste individual. Apagado, nadie la necesita y el
            ingreso es solo con contraseña.
          </p>
          <Form.Check
            id="mfa-global"
            type="switch"
            className="fs-5"
            label={
              global === undefined
                ? 'Cargando…'
                : global
                  ? 'Control general encendido'
                  : 'Control general apagado'
            }
            checked={!!global}
            disabled={global === undefined || cambiarGlobal.isPending}
            onChange={(e) => {
              setAviso(null);
              if (e.target.checked) cambiarGlobal.mutate(true);
              else setApagando(true);
            }}
          />
          {parametros.data?.mfa.actualizadoEn && (
            <p className="small text-body-secondary mt-2 mb-0">
              Último cambio: {fechaHora(parametros.data.mfa.actualizadoEn)}
              {parametros.data.mfa.actualizadoPorNombre
                ? ` por ${parametros.data.mfa.actualizadoPorNombre}`
                : ''}
              . Los cambios aplican en el siguiente ingreso o renovación de sesión (máximo 15
              minutos).
            </p>
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="bg-transparent pt-4 pb-0 border-0">
          <h2 className="h5 mb-1">Ajuste por persona</h2>
          <p className="text-body-secondary mb-0">
            {global === false
              ? 'El control general está apagado: los ajustes se guardan pero no se aplican hasta encenderlo.'
              : '«Según su rol» conserva la regla de siempre: administradoras, contadoras, asesores jurídicos y el superadministrador la usan; el resto no. Cambie el ajuste para exigirla u omitirla a una persona.'}
          </p>
        </Card.Header>
        {global === false && (
          <Card.Body className="pb-0">
            <Alerta tono="aviso">
              Ninguna persona necesita 2FA mientras el control general esté apagado, sin importar su
              ajuste.
            </Alerta>
          </Card.Body>
        )}
        {usuarios.isPending ? (
          <Card.Body>
            <div role="status">Cargando personas…</div>
          </Card.Body>
        ) : usuarios.isError ? (
          <Card.Body>
            <Alerta tono="error">{mensajeDe(usuarios.error)}</Alerta>
          </Card.Body>
        ) : (
          <Table responsive hover className="align-middle mb-0">
            <caption className="visually-hidden">Ajuste de 2FA por persona</caption>
            <thead className="table-light">
              <tr>
                <th scope="col" className="ps-4">
                  Persona
                </th>
                <th scope="col">Roles</th>
                <th scope="col">Ajuste individual</th>
                <th scope="col">Hoy</th>
                <th scope="col" className="pe-4">
                  2FA configurado
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.data.map((u) => (
                <tr key={u.id}>
                  <td className="ps-4">
                    <span className="fw-semibold">{u.nombre}</span>
                    <small className="d-block text-body-secondary">{u.email}</small>
                  </td>
                  <td>
                    {u.esSuperadmin && <Etiqueta tono="info">Superadministrador</Etiqueta>}{' '}
                    {u.roles
                      .filter((r) => r.activo)
                      .map((r) => `${NOMBRE_ROL[r.rol]} · ${r.razonSocial}`)
                      .join('; ') ||
                      (u.esSuperadmin ? (
                        ''
                      ) : (
                        <span className="text-body-secondary">Sin roles</span>
                      ))}
                  </td>
                  <td style={{ minWidth: '12rem' }}>
                    <Form.Select
                      size="sm"
                      aria-label={`Ajuste de 2FA de ${u.nombre}`}
                      value={u.mfaPolitica}
                      disabled={cambiarUsuario.isPending}
                      onChange={(e) =>
                        cambiarUsuario.mutate({ u, politica: e.target.value as PoliticaMfa })
                      }
                    >
                      {OPCIONES.map(([codigo, nombre]) => (
                        <option key={codigo} value={codigo}>
                          {nombre}
                        </option>
                      ))}
                    </Form.Select>
                  </td>
                  <td>
                    <Etiqueta tono={u.mfaRequerido ? 'ok' : 'info'}>
                      {u.mfaRequerido ? 'Se exige' : 'No se exige'}
                    </Etiqueta>
                    <small className="d-block text-body-secondary">{MOTIVO[u.mfaMotivo]}</small>
                  </td>
                  <td className="pe-4">{u.mfaConfigurado ? 'Sí' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <DialogoConfirmacion
        abierto={apagando}
        titulo="Apagar la verificación en dos pasos"
        textoConfirmar="Sí, apagar para todo el sistema"
        peligro
        cargando={cambiarGlobal.isPending}
        onConfirmar={() => cambiarGlobal.mutate(false)}
        onCerrar={() => setApagando(false)}
      >
        Nadie necesitará un código adicional para ingresar, ni siquiera el superadministrador ni
        quienes tienen el ajuste «Exigir siempre». El acceso quedará protegido solo por la
        contraseña. Puede volver a encenderlo cuando quiera.
      </DialogoConfirmacion>
    </>
  );
}
