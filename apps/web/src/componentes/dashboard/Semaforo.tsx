import Badge from 'react-bootstrap/Badge';

export type EstadoSemaforo = 'urgente' | 'riesgo' | 'tramite' | 'cerrado';

const CONFIG: Record<EstadoSemaforo, { texto: string; icono: string }> = {
  urgente: { texto: 'Urgente', icono: 'bi-exclamation-octagon' },
  riesgo: { texto: 'En riesgo', icono: 'bi-exclamation-triangle' },
  tramite: { texto: 'En trámite', icono: 'bi-hourglass-split' },
  cerrado: { texto: 'Cerrado con soporte', icono: 'bi-check-circle' },
};

/** Semáforo de la especificación (§7): siempre texto + ícono, el color solo refuerza. */
export function Semaforo({ estado, texto }: { estado: EstadoSemaforo; texto?: string }) {
  const c = CONFIG[estado];
  return (
    <Badge bg="" className={`semaforo semaforo-${estado}`}>
      <i className={`bi ${c.icono}`} aria-hidden="true" />
      {texto ?? c.texto}
    </Badge>
  );
}
