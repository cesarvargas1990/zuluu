import { Link } from 'react-router';
import { useTitulo } from '@/componentes/useTitulo';

export function NoEncontrado() {
  useTitulo('Página no encontrada');
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="mt-2 text-texto-suave">La dirección no existe o cambió.</p>
      <Link to="/" className="mt-6 inline-block text-acento underline underline-offset-2">
        Ir al inicio
      </Link>
    </main>
  );
}
