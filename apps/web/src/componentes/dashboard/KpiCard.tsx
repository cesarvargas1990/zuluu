import type { ReactNode } from 'react';
import Card from 'react-bootstrap/Card';

interface Props {
  etiqueta: string;
  valor: ReactNode;
  icono: string;
  detalle?: ReactNode;
}

/** Tarjeta de indicador: valor destacado (cifras tabulares), etiqueta e ícono decorativo. */
export function KpiCard({ etiqueta, valor, icono, detalle }: Props) {
  return (
    <Card className="kpi">
      <Card.Body className="d-flex gap-3 align-items-start">
        <span className="kpi-icono" aria-hidden="true">
          <i className={`bi ${icono}`} />
        </span>
        <div className="min-w-0">
          <p className="kpi-etiqueta mb-1">{etiqueta}</p>
          <p className="kpi-valor mb-0">{valor}</p>
          {detalle && <p className="small text-body-secondary mb-0 mt-1">{detalle}</p>}
        </div>
      </Card.Body>
    </Card>
  );
}
