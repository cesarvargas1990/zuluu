import { Link } from 'react-router';
import { useTitulo } from '@/componentes/useTitulo';

export function NoEncontrado() {
  useTitulo('Página no encontrada');
  return (
    <main className="container py-5 text-center">
      <h1 className="h3">Página no encontrada</h1>
      <p className="text-body-secondary">La dirección no existe o cambió.</p>
      <Link to="/" className="btn btn-primary mt-3">
        Ir al inicio
      </Link>
    </main>
  );
}
