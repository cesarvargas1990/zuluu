import { useEffect, useRef, type ReactNode } from 'react';
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

/**
 * Diálogo modal de confirmación sobre `<dialog>` nativo: atrapa el foco, cierra con Escape
 * y devuelve el foco al elemento que lo abrió.
 */
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
  const ref = useRef<HTMLDialogElement>(null);
  const origen = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      origen.current = document.activeElement as HTMLElement | null;
      d.showModal?.();
      if (!d.showModal) d.setAttribute('open', '');
    } else if (!abierto && d.open) {
      d.close?.();
      if (!d.close) d.removeAttribute('open');
      origen.current?.focus();
    }
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialogo-titulo"
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCerrar();
        }
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-borde bg-superficie p-6 text-texto shadow-xl backdrop:bg-black/40"
    >
      <h2 id="dialogo-titulo" className="text-lg font-semibold">
        {titulo}
      </h2>
      <div className="mt-2 text-sm text-texto-suave">{children}</div>
      <div className="mt-6 flex justify-end gap-3">
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
      </div>
    </dialog>
  );
}
