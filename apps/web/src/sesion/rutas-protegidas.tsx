import type { Rol } from '@zulu/shared';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSesion } from './SesionProvider';

function Cargando() {
  return (
    <div
      role="status"
      className="d-grid vh-100 text-body-secondary"
      style={{ placeItems: 'center' }}
    >
      Cargando…
    </div>
  );
}

/** Solo sin sesión (ingreso, olvidé). Con sesión redirige al destino correspondiente. */
export function RequiereAnonimo() {
  const { estado } = useSesion();
  if (estado.tipo === 'cargando') return <Cargando />;
  if (estado.tipo === 'mfa') return <Navigate to="/mfa" replace />;
  if (estado.tipo === 'activa') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Sesión pendiente de MFA: solo pantallas de verificación/registro. */
export function RequiereMfaPendiente() {
  const { estado } = useSesion();
  if (estado.tipo === 'cargando') return <Cargando />;
  if (estado.tipo === 'anonimo') return <Navigate to="/ingresar" replace />;
  if (estado.tipo === 'activa') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Sesión completa. */
export function RequiereSesion() {
  const { estado, eleccionPendiente } = useSesion();
  const ubicacion = useLocation();
  if (estado.tipo === 'cargando') return <Cargando />;
  if (estado.tipo === 'anonimo')
    return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  if (estado.tipo === 'mfa') return <Navigate to="/mfa" replace />;
  if (eleccionPendiente && ubicacion.pathname !== '/elegir-condominio')
    return <Navigate to="/elegir-condominio" replace />;
  return <Outlet />;
}

/** Contenido solo para ciertos roles en el condominio activo (o solo superadmin con `roles=[]` y `superadmin`). */
export function RequiereRol({
  roles,
  superadmin = false,
  children,
}: {
  roles: Rol[];
  superadmin?: boolean;
  children: ReactNode;
}) {
  const { condominioActivo, estado } = useSesion();
  const esSuperadmin = estado.tipo === 'activa' && estado.yo.esSuperadmin;
  const permitido = superadmin
    ? esSuperadmin
    : !!condominioActivo && roles.includes(condominioActivo.rol);
  if (!permitido) {
    return (
      <div className="estado-vacio">
        <i className="bi bi-shield-lock" aria-hidden="true" />
        <h1 className="h4 mt-3">No tiene acceso a esta sección</h1>
        <p className="text-body-secondary">
          Si necesita acceso, pídaselo al administrador del condominio.
        </p>
      </div>
    );
  }
  return children;
}
