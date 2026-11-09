import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { Yo } from '@/api/auth';
import { rutas } from '@/rutas';
import { SesionProvider } from '@/sesion/SesionProvider';

type Manejador = (cuerpo: unknown) => { status: number; cuerpo?: unknown };

/** API falsa: "MÉTODO /ruta" → respuesta. Rutas no definidas responden 404. */
export function servidorFalso(manejadores: Record<string, Manejador>) {
  const llamadas: { clave: string; cuerpo: unknown; headers: Headers }[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const ruta = String(url).replace('/api/v1', '');
    const clave = `${init?.method ?? 'GET'} ${ruta}`;
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    llamadas.push({ clave, cuerpo, headers: new Headers(init?.headers) });
    const m = manejadores[clave];
    const r = m ? m(cuerpo) : { status: 404, cuerpo: { message: 'Recurso no encontrado.' } };
    return new Response(r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), {
      status: r.status,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { llamadas, manejadores };
}

export function renderApp(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    router,
    ...render(
      <QueryClientProvider client={qc}>
        <SesionProvider alSalir={() => qc.clear()}>
          <RouterProvider router={router} />
        </SesionProvider>
      </QueryClientProvider>,
    ),
  };
}

export const yoDe = (parcial: Partial<Yo> = {}): Yo => ({
  id: 'u1',
  email: 'ana@demo.test',
  nombre: 'Ana Prueba',
  esSuperadmin: false,
  mfa: { requerido: false, configurado: false, verificado: false },
  condominios: [
    { condominioId: 'c1', razonSocial: 'Condominio Demo Las Palmas', rol: 'ASISTENTE' },
  ],
  ...parcial,
});

export const sinSesion = {
  'POST /auth/refresh': () => ({ status: 401, cuerpo: { message: 'x' } }),
};
