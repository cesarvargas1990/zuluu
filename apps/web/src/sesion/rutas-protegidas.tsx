import type { Rol } from '@zulu/shared';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSesion } from './SesionProvider';

function Cargando() {
  return (
    <div role="status" className="grid min-h-dvh place-items-center text-texto-suave">
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
  const { estado } = useSesion();
  const ubicacion = useLocation();
  if (estado.tipo === 'cargando') return <Cargando />;
  if (estado.tipo === 'anonimo')
    return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  if (estado.tipo === 'mfa') return <Navigate to="/mfa" replace />;
  return <Outlet />;
}

/** Contenido solo para ciertos roles en el condominio activo. */
export function RequiereRol({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { condominioActivo } = useSesion();
  if (!condominioActivo || !roles.includes(condominioActivo.rol)) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <h1 className="text-2xl font-semibold">No tiene acceso a esta sección</h1>
        <p className="mt-2 text-texto-suave">
          Si necesita acceso, pídaselo a la administradora del condominio.
        </p>
      </div>
    );
  }
  return children;
}
