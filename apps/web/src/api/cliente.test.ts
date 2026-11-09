import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, api, configurarCliente } from './cliente';
import { crearRenovador } from './renovacion';

const respuesta = (status: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let token: string | null;
const renovar = vi.fn<() => Promise<boolean>>();
const alTerminarSesion = vi.fn();
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  token = 'tok-1';
  renovar.mockReset();
  alTerminarSesion.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configurarCliente({
    obtenerToken: () => token,
    obtenerCondominio: () => 'condo-a',
    renovar,
    alTerminarSesion,
  });
});

describe('api()', () => {
  it('envía token, condominio y JSON, y devuelve el cuerpo', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { ok: 1 }));
    await expect(api('/membresias', { metodo: 'POST', cuerpo: { a: 1 } })).resolves.toEqual({
      ok: 1,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/membresias');
    const h = new Headers(init!.headers);
    expect(h.get('authorization')).toBe('Bearer tok-1');
    expect(h.get('x-condominio-id')).toBe('condo-a');
    expect(h.get('content-type')).toBe('application/json');
    expect(init!.body).toBe('{"a":1}');
    expect(init!.credentials).toBe('same-origin');
  });

  it('204 devuelve undefined', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(204));
    await expect(api('/auth/logout', { metodo: 'POST' })).resolves.toBeUndefined();
  });

  it('ante 401 renueva una vez y reintenta con el token nuevo', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(401, { message: 'Debe iniciar sesión.' }));
    fetchMock.mockResolvedValueOnce(respuesta(200, { ok: 2 }));
    renovar.mockImplementation(async () => {
      token = 'tok-2';
      return true;
    });
    await expect(api('/auth/yo')).resolves.toEqual({ ok: 2 });
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[1]![1]!.headers).get('authorization')).toBe(
      'Bearer tok-2',
    );
  });

  it('si la renovación falla, termina la sesión y lanza 401', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(401, { message: 'Debe iniciar sesión.' }));
    renovar.mockResolvedValue(false);
    await expect(api('/auth/yo')).rejects.toMatchObject({ status: 401 });
    expect(alTerminarSesion).toHaveBeenCalledTimes(1);
  });

  it('no renueva cuando la ruta lo desactiva (login)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(401, { message: 'Email o contraseña incorrectos.' }));
    const error = (await api('/auth/login', { metodo: 'POST', renovarEn401: false }).catch(
      (e: unknown) => e,
    )) as ErrorApi;
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error.message).toBe('Email o contraseña incorrectos.');
    expect(renovar).not.toHaveBeenCalled();
    expect(alTerminarSesion).not.toHaveBeenCalled();
  });

  it('mapea errores de validación por campo', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta(400, {
        mensaje: 'Datos inválidos',
        errores: [{ campo: 'email', mensaje: 'Email inválido' }],
      }),
    );
    const error = (await api('/membresias', { metodo: 'POST', cuerpo: {} }).catch(
      (e: unknown) => e,
    )) as ErrorApi;
    expect(error).toMatchObject({ status: 400, message: 'Datos inválidos' });
    expect(error.errores).toEqual([{ campo: 'email', mensaje: 'Email inválido' }]);
  });

  it('error de red ⇒ mensaje en español', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api('/auth/yo')).rejects.toMatchObject({
      status: 0,
      message: 'No se pudo conectar con el servidor. Revise su conexión.',
    });
  });

  it('sin condominio activo no envía el encabezado', async () => {
    configurarCliente({
      obtenerToken: () => null,
      obtenerCondominio: () => null,
      renovar,
      alTerminarSesion,
    });
    fetchMock.mockResolvedValueOnce(respuesta(200, {}));
    await api('/auth/yo');
    const h = new Headers(fetchMock.mock.calls[0]![1]!.headers);
    expect(h.has('x-condominio-id')).toBe(false);
    expect(h.has('authorization')).toBe(false);
  });
});

describe('crearRenovador()', () => {
  it('llamadas concurrentes comparten una sola renovación', async () => {
    let resolver!: (v: boolean) => void;
    const fn = vi.fn(() => new Promise<boolean>((r) => (resolver = r)));
    const renovarUnaVez = crearRenovador(fn);
    const a = renovarUnaVez();
    const b = renovarUnaVez();
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    resolver(true);
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
  });

  it('tras terminar, una nueva llamada renueva de nuevo', async () => {
    const fn = vi.fn(async () => true);
    const renovarUnaVez = crearRenovador(fn);
    await renovarUnaVez();
    await renovarUnaVez();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('un error en la renovación se traduce en false', async () => {
    const renovarUnaVez = crearRenovador(async () => {
      throw new Error('red');
    });
    await expect(renovarUnaVez()).resolves.toBe(false);
  });
});
