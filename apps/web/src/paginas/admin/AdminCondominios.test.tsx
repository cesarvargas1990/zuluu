import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CondominioAdmin } from '@/api/admin';
import { renderApp, servidorFalso, yoDe } from '@/test/utilidades';

describe('Administración de condominios (superadmin)', () => {
  it('lista y crea un condominio; muestra el 409 de NIT repetido', async () => {
    const lista: CondominioAdmin[] = [];
    let intentos = 0;
    servidorFalso({
      'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
      'GET /auth/yo': () => ({
        status: 200,
        cuerpo: yoDe({
          esSuperadmin: true,
          condominios: [],
          mfa: { requerido: true, configurado: true, verificado: true },
        }),
      }),
      'GET /admin/condominios': () => ({ status: 200, cuerpo: lista }),
      'POST /admin/condominios': (c) => {
        intentos++;
        if (intentos > 1)
          return { status: 409, cuerpo: { message: 'Ya existe un condominio con ese NIT.' } };
        const d = c as { razonSocial: string; nit: string };
        lista.push({ id: 'c1', creadoEn: '2026-11-10T00:00:00Z', ...d });
        return { status: 201, cuerpo: lista[0] };
      },
    });
    renderApp('/admin/condominios');
    const u = userEvent.setup();
    expect(await screen.findByText(/Aún no hay condominios/)).toBeInTheDocument();
    await u.click(screen.getAllByRole('button', { name: 'Crear condominio' })[0]!);
    await u.type(screen.getByLabelText('Razón social'), 'Majagua Villa Campestre');
    await u.type(screen.getByLabelText('NIT'), '900123456-7');
    await u.click(screen.getByRole('button', { name: 'Guardar condominio' }));
    expect(await screen.findByText('Majagua Villa Campestre')).toBeInTheDocument();

    await u.click(screen.getAllByRole('button', { name: 'Crear condominio' })[0]!);
    await u.type(screen.getByLabelText('Razón social'), 'Otro');
    await u.type(screen.getByLabelText('NIT'), '900123456-7');
    await u.click(screen.getByRole('button', { name: 'Guardar condominio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un condominio con ese NIT.',
    );
  });
});
