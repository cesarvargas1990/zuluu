import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderApp, servidorFalso, sinSesion, yoDe } from '@/test/utilidades';

beforeEach(() => localStorage.clear());

async function llenar(email = 'ana@demo.test', password = 'una-clave-larga') {
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('Email'), email);
  await u.type(screen.getByLabelText('Contraseña'), password);
  await u.click(screen.getByRole('button', { name: 'Ingresar' }));
  return u;
}

describe('Pantalla de ingreso', () => {
  it('credenciales inválidas: muestra el error y devuelve el foco a la contraseña', async () => {
    servidorFalso({
      ...sinSesion,
      'POST /auth/login': () => ({
        status: 401,
        cuerpo: { message: 'Email o contraseña incorrectos.' },
      }),
    });
    renderApp('/ingresar');
    await llenar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });

  it('cuenta bloqueada (429): muestra el mensaje del API', async () => {
    servidorFalso({
      ...sinSesion,
      'POST /auth/login': () => ({
        status: 429,
        cuerpo: { message: 'Demasiados intentos fallidos. Intente de nuevo más tarde.' },
      }),
    });
    renderApp('/ingresar');
    await llenar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos fallidos');
  });

  it('ingreso sin MFA lleva al inicio con nombre, condominio y rol', async () => {
    servidorFalso({
      ...sinSesion,
      'POST /auth/login': () => ({
        status: 200,
        cuerpo: { accessToken: 't', mfaRequerido: false, mfaConfigurado: false },
      }),
      'GET /auth/yo': () => ({ status: 200, cuerpo: yoDe() }),
    });
    renderApp('/ingresar');
    await llenar();
    expect(await screen.findByRole('heading', { name: /Hola, Ana/ })).toBeInTheDocument();
    expect(screen.getAllByText('Condominio Demo Las Palmas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Asistente administrativa').length).toBeGreaterThan(0);
  });

  it('ingreso con MFA configurado pide el código y luego entra', async () => {
    let verificado = false;
    servidorFalso({
      ...sinSesion,
      'POST /auth/login': () => ({
        status: 200,
        cuerpo: { accessToken: 't', mfaRequerido: true, mfaConfigurado: true },
      }),
      'GET /auth/yo': () => ({
        status: 200,
        cuerpo: yoDe({ mfa: { requerido: true, configurado: true, verificado } }),
      }),
      'POST /auth/mfa/verificar': (c) => {
        if ((c as { codigo: string }).codigo !== '123456')
          return { status: 401, cuerpo: { message: 'Código incorrecto.' } };
        verificado = true;
        return { status: 200, cuerpo: { accessToken: 't2' } };
      },
    });
    renderApp('/ingresar');
    const u = await llenar();
    const codigo = await screen.findByLabelText('Código de 6 dígitos');
    await u.type(codigo, '000000');
    await u.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código incorrecto.');
    await u.clear(codigo);
    await u.type(codigo, '123456');
    await u.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('heading', { name: /Hola, Ana/ })).toBeInTheDocument();
  });
});
