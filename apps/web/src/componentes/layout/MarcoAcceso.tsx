import type { ReactNode } from 'react';
import Card from 'react-bootstrap/Card';
import { Logo } from '../Logo';

/** Marco de las pantallas sin sesión: fondo verde ZULU con el logo y una tarjeta centrada. */
export function MarcoAcceso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="marco-acceso">
      <div className="marco-acceso-tarjeta">
        <Logo className="marco-acceso-logo" />
        <Card as="main" className="shadow">
          <Card.Body className="p-4 p-sm-5">
            <h1 className="h4 mb-4">{titulo}</h1>
            {children}
          </Card.Body>
        </Card>
        <p className="text-center small mt-4 mb-0" style={{ color: 'rgba(255,255,255,.7)' }}>
          ZULU ADMIN · Majagua Digital
        </p>
      </div>
    </div>
  );
}
