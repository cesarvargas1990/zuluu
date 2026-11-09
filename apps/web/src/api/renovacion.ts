/**
 * Envuelve la renovación para que llamadas concurrentes compartan una sola petición
 * y, entre pestañas, se serialicen con Web Locks (evita que dos rotaciones parezcan reuso).
 */
export function crearRenovador(renovar: () => Promise<boolean>): () => Promise<boolean> {
  let enCurso: Promise<boolean> | null = null;

  const conBloqueo = (): Promise<boolean> => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    return locks ? locks.request('zulu-renovar-sesion', () => renovar()) : renovar();
  };

  return () => {
    enCurso ??= conBloqueo()
      .catch(() => false)
      .finally(() => {
        enCurso = null;
      });
    return enCurso;
  };
}
