import type { ReactNode } from 'react';

export function EstadoVacio({
  icono,
  titulo,
  children,
  accion,
}: {
  icono: string;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="estado-vacio">
      <i className={`bi ${icono}`} aria-hidden="true" />
      <h2 className="h5 mt-3">{titulo}</h2>
      {children && (
        <p className="text-body-secondary mx-auto" style={{ maxWidth: '32rem' }}>
          {children}
        </p>
      )}
      {accion}
    </div>
  );
}
