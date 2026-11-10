import type { ReactNode } from 'react';

/** Encabezado de página: único h1, descripción y acciones a la derecha. */
export function PageHeader({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div>
        <h1 className="h3 mb-1">{titulo}</h1>
        {descripcion && <p className="text-body-secondary mb-0">{descripcion}</p>}
      </div>
      {acciones && <div className="d-flex gap-2">{acciones}</div>}
    </div>
  );
}
