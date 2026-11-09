import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Yo } from '@/api/auth';
import { SesionProvider, useSesion } from './SesionProvider';

const yoBase: Yo = {
  id: 'u1',
  email: 'a@demo.test',
  nombre: 'Ana',
  esSuperadmin: false,
  mfa: { requerido: false, configurado: false, verificado: false },
  condominios: [
    { condominioId: 'c1', razonSocial: 'Las Palmas', rol: 'ASISTENTE' },
    { condominioId: 'c2', razonSocial: 'El Lago', rol: 'CONTADORA' },
  ],
};

const fetchMock = vi.fn<typeof fetch>();
const json = (status: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status });

function Sonda() {
  const s = useSesion();
  return (
    <div>
      <p data-testid="estado">{s.estado.tipo}</p>
      <p data-testid="condo">{s.condominioActivo?.razonSocial ?? '—'}</p>
      <p data-testid="aviso">{s.estado.tipo === 'anonimo' ? (s.estado.aviso ?? '') : ''}</p>
      <button onClick={() => s.elegirCondominio('c2')}>cambiar</button>
      <button onClick={() => void s.salir()}>salir</button>
    </div>
  );
}

const montar = () =>
  render(
    <SesionProvider>
      <Sonda />
    </SesionProvider>,
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});

describe('SesionProvider', () => {
  it('sin cookie de renovación queda anónimo', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { message: 'x' }));
    montar();
    expect(screen.getByTestId('estado')).toHaveTextContent('cargando');
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('anonimo'));
  });

  it('con renovación válida recupera la sesión y elige el primer condominio', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { accessToken: 't' }))
      .mockResolvedValueOnce(json(200, yoBase));
    montar();
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('activa'));
    expect(screen.getByTestId('condo')).toHaveTextContent('Las Palmas');
  });

  it('recuerda el condominio elegido por usuario', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { accessToken: 't' }))
      .mockResolvedValueOnce(json(200, yoBase));
    const { unmount } = montar();
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('activa'));
    act(() => screen.getByText('cambiar').click());
    expect(screen.getByTestId('condo')).toHaveTextContent('El Lago');
    unmount();

    fetchMock
      .mockResolvedValueOnce(json(200, { accessToken: 't' }))
      .mockResolvedValueOnce(json(200, yoBase));
    montar();
    await waitFor(() => expect(screen.getByTestId('condo')).toHaveTextContent('El Lago'));
  });

  it('MFA requerido y no verificado ⇒ estado mfa', async () => {
    const yo = { ...yoBase, mfa: { requerido: true, configurado: true, verificado: false } };
    fetchMock
      .mockResolvedValueOnce(json(200, { accessToken: 't' }))
      .mockResolvedValueOnce(json(200, yo));
    montar();
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('mfa'));
  });

  it('salir vuelve a anónimo', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { accessToken: 't' }))
      .mockResolvedValueOnce(json(200, yoBase))
      .mockResolvedValueOnce(json(204));
    montar();
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('activa'));
    await act(async () => screen.getByText('salir').click());
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('anonimo'));
    expect(fetchMock.mock.calls[2]![0]).toBe('/api/v1/auth/logout');
  });
});
