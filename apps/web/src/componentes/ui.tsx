import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variante = 'primario' | 'secundario' | 'peligro' | 'enlace';

const estilosBoton: Record<Variante, string> = {
  primario: 'bg-acento text-white hover:bg-acento-oscuro disabled:bg-acento/60',
  secundario:
    'bg-superficie text-texto border border-borde hover:bg-fondo disabled:text-texto-suave',
  peligro: 'bg-peligro text-white hover:bg-peligro/90 disabled:bg-peligro/60',
  enlace: 'text-acento underline underline-offset-2 hover:text-acento-oscuro px-0 py-0 min-h-0',
};

export function Boton({
  variante = 'primario',
  cargando = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold',
        'transition-colors disabled:cursor-not-allowed',
        estilosBoton[variante],
        className,
      )}
    >
      {children}
    </button>
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
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={idCampo} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        ref={ref}
        id={idCampo}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(ayuda ? idAyuda : null, error ? idError : null) || undefined}
        className={cx(
          'min-h-11 rounded-md border bg-superficie px-3 py-2 text-base',
          error ? 'border-peligro' : 'border-borde',
        )}
      />
      {ayuda && (
        <p id={idAyuda} className="text-sm text-texto-suave">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="text-sm font-medium text-peligro">
          {error}
        </p>
      )}
    </div>
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
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={idCampo} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select
        id={idCampo}
        {...props}
        aria-invalid={error ? true : undefined}
        className="min-h-11 rounded-md border border-borde bg-superficie px-3 py-2 text-base"
      >
        {children}
      </select>
      {error && <p className="text-sm font-medium text-peligro">{error}</p>}
    </div>
  );
}

type Tono = 'error' | 'aviso' | 'ok' | 'info';
const estilosAlerta: Record<Tono, string> = {
  error: 'bg-peligro-suave text-peligro border-peligro/30',
  aviso: 'bg-aviso-suave text-aviso border-aviso/30',
  ok: 'bg-ok-suave text-ok border-ok/30',
  info: 'bg-acento-suave text-acento-oscuro border-acento/30',
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
    <div
      role={tono === 'error' ? 'alert' : 'status'}
      className={cx('rounded-md border px-4 py-3 text-sm', estilosAlerta[tono], className)}
    >
      {children}
    </div>
  );
}

/** Etiqueta de estado: siempre con texto, el color solo refuerza. */
export function Etiqueta({ tono = 'info', children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
        estilosAlerta[tono],
      )}
    >
      {children}
    </span>
  );
}

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx('rounded-lg border border-borde bg-superficie p-6 shadow-sm', className)}
    >
      {children}
    </section>
  );
}
