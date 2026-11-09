import { useEffect, useState } from 'react';

type Health = { status: string; db: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <main>
      <h1>ZULU ADMIN · Majagua Digital</h1>
      <p>
        Estado del API:{' '}
        {error
          ? 'sin conexión'
          : health
            ? `${health.status} (base de datos: ${health.db})`
            : 'consultando…'}
      </p>
    </main>
  );
}
