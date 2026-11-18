import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { GrupoAdmin } from '@/api/admin';
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

describe('Administración de condominios agrupadores (superadmin)', () => {
  it('lista, crea (409 si el nombre se repite) y renombra', async () => {
    const lista: GrupoAdmin[] = [
      { id: 'g1', nombre: 'Majagua', copropiedades: 3, creadoEn: '2026-11-10T00:00:00Z' },
    ];
    let creados = 0;
    servidorFalso({
      ...sesion,
      'GET /admin/grupos': () => ({ status: 200, cuerpo: lista }),
      'POST /admin/grupos': (c) => {
        creados++;
        if (creados > 1)
          return { status: 409, cuerpo: { message: 'Ya existe un condominio con ese nombre.' } };
        const g = {
          id: 'g2',
          nombre: (c as { nombre: string }).nombre,
          copropiedades: 0,
          creadoEn: '2026-11-11T00:00:00Z',
        };
        lista.push(g);
        return { status: 201, cuerpo: g };
      },
      'PATCH /admin/grupos/g1': (c) => {
        lista[0]!.nombre = (c as { nombre: string }).nombre;
        return { status: 200, cuerpo: { id: 'g1', nombre: lista[0]!.nombre } };
      },
    });
    renderApp('/admin/grupos');
    const u = userEvent.setup();
    expect(await screen.findByText('Majagua')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    await u.click(screen.getAllByRole('button', { name: 'Crear condominio' })[0]!);
    await u.type(screen.getByLabelText('Nombre del condominio'), 'Altos del Lago');
    await u.click(screen.getByRole('button', { name: 'Guardar condominio' }));
    expect(await screen.findByText('Altos del Lago')).toBeInTheDocument();

    await u.click(screen.getAllByRole('button', { name: 'Crear condominio' })[0]!);
    await u.type(screen.getByLabelText('Nombre del condominio'), 'Otro');
    await u.click(screen.getByRole('button', { name: 'Guardar condominio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un condominio con ese nombre.',
    );

    await u.click(screen.getByRole('button', { name: 'Renombrar Majagua' }));
    const campo = screen.getByLabelText('Nuevo nombre de Majagua');
    await u.clear(campo);
    await u.type(campo, 'Majagua Villa Campestre');
    await u.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(await screen.findByText('Majagua Villa Campestre')).toBeInTheDocument();
  });
});
