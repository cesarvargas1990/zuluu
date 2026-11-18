import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CondominioAdmin, GrupoAdmin } from '@/api/admin';
import { renderApp, servidorFalso, yoDe } from '@/test/utilidades';

const sesion = {
  'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
  'GET /auth/yo': () => ({
    status: 200,
    cuerpo: yoDe({
      esSuperadmin: true,
      condominios: [],
      mfa: { requerido: true, configurado: true, verificado: true },
    }),
  }),
};
const grupos: GrupoAdmin[] = [
  {
    id: 'g1',
    nombre: 'Majagua Villa Campestre',
    copropiedades: 0,
    creadoEn: '2026-11-10T00:00:00Z',
  },
];

describe('Administración de copropiedades (superadmin)', () => {
  it('lista y crea una copropiedad dentro de un condominio; muestra el 409 de NIT repetido', async () => {
    const lista: CondominioAdmin[] = [];
    let intentos = 0;
    servidorFalso({
      ...sesion,
      'GET /admin/grupos': () => ({ status: 200, cuerpo: grupos }),
      'GET /admin/condominios': () => ({ status: 200, cuerpo: lista }),
      'POST /admin/condominios': (c) => {
        intentos++;
        if (intentos > 1)
          return { status: 409, cuerpo: { message: 'Ya existe un condominio con ese NIT.' } };
        const d = c as { razonSocial: string; nit: string; grupoId?: string };
        lista.push({
          id: 'c1',
          creadoEn: '2026-11-10T00:00:00Z',
          grupoNombre: grupos[0]!.nombre,
          ...d,
        });
        return { status: 201, cuerpo: lista[0] };
      },
    });
    renderApp('/admin/condominios');
    const u = userEvent.setup();
    expect(await screen.findByText(/Aún no hay copropiedades/)).toBeInTheDocument();
    await u.click(screen.getAllByRole('button', { name: 'Crear copropiedad' })[0]!);
    await u.type(screen.getByLabelText('Razón social'), 'Torre Norte');
    await u.type(screen.getByLabelText('NIT'), '900123456-7');
    await u.selectOptions(screen.getByLabelText('Condominio'), 'g1');
    await u.click(screen.getByRole('button', { name: 'Guardar copropiedad' }));
    expect(await screen.findByText('Torre Norte')).toBeInTheDocument();
    expect(screen.getAllByText('Majagua Villa Campestre').length).toBeGreaterThan(0);

    await u.click(screen.getAllByRole('button', { name: 'Crear copropiedad' })[0]!);
    await u.type(screen.getByLabelText('Razón social'), 'Otra');
    await u.type(screen.getByLabelText('NIT'), '900123456-7');
    await u.click(screen.getByRole('button', { name: 'Guardar copropiedad' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un condominio con ese NIT.',
    );
  });

  it('cambia el condominio de una copropiedad desde la lista', async () => {
    const lista: CondominioAdmin[] = [
      {
        id: 'c1',
        razonSocial: 'Torre Norte',
        nit: '900111111-1',
        creadoEn: '2026-11-10T00:00:00Z',
        grupoId: null,
        grupoNombre: null,
      },
    ];
    let enviado: unknown = null;
    servidorFalso({
      ...sesion,
      'GET /admin/grupos': () => ({ status: 200, cuerpo: grupos }),
      'GET /admin/condominios': () => ({ status: 200, cuerpo: lista }),
      'PATCH /admin/condominios/c1/grupo': (c) => {
        enviado = c;
        lista[0]!.grupoId = 'g1';
        lista[0]!.grupoNombre = grupos[0]!.nombre;
        return { status: 200, cuerpo: { id: 'c1', grupoId: 'g1', grupoNombre: grupos[0]!.nombre } };
      },
    });
    renderApp('/admin/condominios');
    const u = userEvent.setup();
    await u.selectOptions(await screen.findByLabelText('Condominio de Torre Norte'), 'g1');
    expect(enviado).toEqual({ grupoId: 'g1' });
  });
});
