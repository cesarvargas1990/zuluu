import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ElegirCondominio } from './ElegirCondominio';

const confirmarCondominio = vi.fn();
const sesion = {
  estado: {
    tipo: 'activa',
    yo: {
      id: 'u1',
      nombre: 'Ana',
      esSuperadmin: false,
      condominios: [
        {
          condominioId: 'c1',
          razonSocial: 'Torre Norte',
          rol: 'ADMINISTRADORA',
          grupoId: 'g1',
          grupoNombre: 'Majagua Villa Campestre',
        },
        {
          condominioId: 'c1',
          razonSocial: 'Torre Norte',
          rol: 'ASISTENTE',
          grupoId: 'g1',
          grupoNombre: 'Majagua Villa Campestre',
        },
        {
          condominioId: 'c2',
          razonSocial: 'Torre Sur',
          rol: 'ADMINISTRADORA',
          grupoId: 'g1',
          grupoNombre: 'Majagua Villa Campestre',
        },
        {
          condominioId: 'c3',
          razonSocial: 'Lago Azul',
          rol: 'ADMINISTRADORA',
          grupoId: 'g2',
          grupoNombre: 'Altos del Lago',
        },
        {
          condominioId: 'c4',
          razonSocial: 'Casa Suelta',
          rol: 'ADMINISTRADORA',
          grupoId: null,
          grupoNombre: null,
        },
      ],
    },
  },
  confirmarCondominio,
};
vi.mock('@/sesion/SesionProvider', () => ({ useSesion: () => sesion }));

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/elegir-condominio']}>
      <Routes>
        <Route path="/elegir-condominio" element={<ElegirCondominio />} />
        <Route path="/" element={<p>Inicio</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ElegirCondominio', () => {
  it('agrupa las copropiedades bajo su condominio; las sueltas van al final', () => {
    montar();
    const grupo1 = screen.getByRole('group', { name: 'Majagua Villa Campestre' });
    expect(within(grupo1).getAllByRole('button')).toHaveLength(2);
    const grupo2 = screen.getByRole('group', { name: 'Altos del Lago' });
    expect(within(grupo2).getByRole('button', { name: /Lago Azul/ })).toBeInTheDocument();
    const sin = screen.getByRole('group', { name: 'Sin condominio asignado' });
    expect(within(sin).getByRole('button', { name: /Casa Suelta/ })).toBeInTheDocument();
    const titulos = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'));
    expect(titulos).toEqual([
      'Altos del Lago',
      'Majagua Villa Campestre',
      'Sin condominio asignado',
    ]);
  });

  it('lista cada copropiedad una sola vez, con todos sus roles', () => {
    montar();
    expect(screen.getAllByRole('button', { name: /Torre Norte/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Torre Norte/ })).toHaveTextContent(
      /Administrador.*Asistente/,
    );
  });

  it('al elegir confirma la copropiedad y entra al inicio', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: /Torre Sur/ }));
    expect(confirmarCondominio).toHaveBeenCalledWith('c2');
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
  });
});
