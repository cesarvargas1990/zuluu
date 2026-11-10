import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { rutas } from './rutas';
import { SesionProvider } from './sesion/SesionProvider';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './estilos/main.scss';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});
const router = createBrowserRouter(rutas, {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SesionProvider alSalir={() => queryClient.clear()}>
        <RouterProvider router={router} />
      </SesionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
