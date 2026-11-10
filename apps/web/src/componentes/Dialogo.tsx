import type { ReactNode } from 'react';
import Modal from 'react-bootstrap/Modal';
import { Boton } from './ui';

interface Props {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  textoConfirmar: string;
  peligro?: boolean;
  cargando?: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}

/** Confirmación modal (React-Bootstrap): atrapa el foco, cierra con Escape y devuelve el foco. */
export function DialogoConfirmacion({
  abierto,
  titulo,
  children,
  textoConfirmar,
  peligro,
  cargando,
  onConfirmar,
  onCerrar,
}: Props) {
  return (
    <Modal
      show={abierto}
      onHide={onCerrar}
      centered
      aria-labelledby="dialogo-titulo"
      animation={import.meta.env.MODE !== 'test'}
    >
      <Modal.Header closeButton closeLabel="Cerrar">
        <Modal.Title as="h2" id="dialogo-titulo" className="h5">
          {titulo}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-body-secondary">{children}</Modal.Body>
      <Modal.Footer>
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton
          variante={peligro ? 'peligro' : 'primario'}
          cargando={cargando}
          onClick={onConfirmar}
        >
          {textoConfirmar}
        </Boton>
      </Modal.Footer>
    </Modal>
  );
}
