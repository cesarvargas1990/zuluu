import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variante = 'primario' | 'secundario' | 'peligro' | 'enlace';
const VARIANTE: Record<Variante, string> = {
  primario: 'primary',
  secundario: 'outline-secondary',
  peligro: 'danger',
  enlace: 'link',
};

export function Boton({
  variante = 'primario',
  cargando = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  return (
    <Button
      {...props}
      type={type}
      variant={VARIANTE[variante]}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cx(
        'd-inline-flex align-items-center justify-content-center gap-2',
        variante === 'enlace' && 'p-0',
        className,
      )}
    >
      {cargando && <Spinner animation="border" size="sm" aria-hidden="true" />}
      {children}
    </Button>
  );
}

interface PropsCampo {
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  className,
  id,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & PropsCampo & { ref?: Ref<HTMLInputElement> }) {
  const generado = useId();
  const idCampo = id ?? generado;
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;
  return (
    <Form.Group controlId={idCampo} className={className}>
      <Form.Label>{etiqueta}</Form.Label>
      <Form.Control
        ref={ref}
        {...(props as object)}
        isInvalid={!!error}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(ayuda ? idAyuda : null, error ? idError : null) || undefined}
      />
      {ayuda && (
        <Form.Text id={idAyuda} className="d-block">
          {ayuda}
        </Form.Text>
      )}
      {error && (
        <Form.Control.Feedback id={idError} type="invalid">
          {error}
        </Form.Control.Feedback>
      )}
    </Form.Group>
  );
}

export function Selector({
  etiqueta,
  error,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & PropsCampo) {
  const generado = useId();
  const idCampo = id ?? generado;
  return (
    <Form.Group controlId={idCampo} className={className}>
      <Form.Label>{etiqueta}</Form.Label>
      <Form.Select
        {...(props as object)}
        isInvalid={!!error}
        aria-invalid={error ? true : undefined}
      >
        {children}
      </Form.Select>
      {error && <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>}
    </Form.Group>
  );
}

type Tono = 'error' | 'aviso' | 'ok' | 'info';
const VARIANTE_ALERTA: Record<Tono, string> = {
  error: 'danger',
  aviso: 'warning',
  ok: 'success',
  info: 'info',
};
const ICONO_ALERTA: Record<Tono, string> = {
  error: 'bi-exclamation-octagon',
  aviso: 'bi-exclamation-triangle',
  ok: 'bi-check-circle',
  info: 'bi-info-circle',
};

/** Mensaje anunciado a lectores de pantalla: `alert` para errores, `status` para el resto. */
export function Alerta({
  tono = 'info',
  children,
  className,
}: {
  tono?: Tono;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Alert
      variant={VARIANTE_ALERTA[tono]}
      role={tono === 'error' ? 'alert' : 'status'}
      className={cx('d-flex gap-2 align-items-start mb-0', className)}
    >
      <i className={cx('bi', ICONO_ALERTA[tono])} aria-hidden="true" />
      <div>{children}</div>
    </Alert>
  );
}

const CLASE_ETIQUETA: Record<Tono, string> = {
  error: 'bg-danger-subtle text-danger-emphasis border border-danger-subtle',
  aviso: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle',
  ok: 'bg-success-subtle text-success-emphasis border border-success-subtle',
  info: 'bg-primary-subtle text-primary-emphasis border border-primary-subtle',
};

/** Etiqueta de estado: siempre con texto, el color solo refuerza. */
export function Etiqueta({ tono = 'info', children }: { tono?: Tono; children: ReactNode }) {
  return (
    <Badge bg="" className={CLASE_ETIQUETA[tono]}>
      {children}
    </Badge>
  );
}

export function Tarjeta({
  children,
  className,
  cuerpo = true,
}: {
  children: ReactNode;
  className?: string;
  cuerpo?: boolean;
}) {
  return (
    <Card as="section" className={className}>
      {cuerpo ? <Card.Body>{children}</Card.Body> : children}
    </Card>
  );
}
