import { useEffect } from 'react';

/** Título de la pestaña por pantalla (orientación para lectores de pantalla y pestañas). */
export function useTitulo(titulo: string) {
  useEffect(() => {
    document.title = `${titulo} · ZULU ADMIN`;
  }, [titulo]);
}
