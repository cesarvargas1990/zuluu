import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Membresia } from '@/api/membresias';
import { renderApp, servidorFalso, yoDe } from '@/test/utilidades';

const yoAdmin = yoDe({
  id: 'admin',
  nombre: 'Ana Administradora',
  mfa: { requerido: true, configurado: true, verificado: true },
  condominios: [{ condominioId: 'c1', razonSocial: 'Las Palmas', rol: 'ADMINISTRADORA' }],
});

const membresia = (
  id: string,
  nombre: string,
  rol: Membresia['rol'],
  extra: Partial<Membresia> = {},
): Membresia => ({
  id,
  condominioId: 'c1',
  rol,
  activo: true,
  createdAt: '2026-11-09T00:00:00Z',
  usuario: { id: `u-${id}`, email: `${id}@demo.test`, nombre, activo: true },
  permisos: [],
  ...extra,
});

let lista: Membresia[];
function servidorAdmin() {
  return servidorFalso({
    'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
    'GET /auth/yo': () => ({ status: 200, cuerpo: yoAdmin }),
    'GET /membresias': () => ({ status: 200, cuerpo: lista }),
  });
}

beforeEach(() => {
  localStorage.clear();
  lista = [
    membresia('m-admin', 'Ana Administradora', 'ADMINISTRADORA', {
      usuario: { id: 'admin', email: 'ana@demo.test', nombre: 'Ana Administradora', activo: true },
    }),
    membresia('m-asis', 'Andrés Asistente', 'ASISTENTE'),
  ];
});

describe('Personas y permisos', () => {
  it('una asistente no ve el enlace y la URL directa muestra "No tiene acceso"', async () => {
    servidorFalso({
      'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
      'GET /auth/yo': () => ({ status: 200, cuerpo: yoDe() }),
    });
    renderApp('/personas');
    expect(
      await screen.findByRole('heading', { name: 'No tiene acceso a esta sección' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Personas y permisos' })).not.toBeInTheDocument();
  });

  it('lista nombre, email, rol y estado en texto', async () => {
    lista[1] = { ...lista[1]!, activo: false };
    servidorAdmin();
    renderApp('/personas');
    const fila = (await screen.findByText('Andrés Asistente')).closest('tr')!;
    expect(within(fila).getByText('m-asis@demo.test')).toBeInTheDocument();
    expect(within(fila).getByText('Inactiva')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Personas y permisos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('agrega una persona y avisa que recibirá un correo', async () => {
    const s = servidorAdmin();
    s.manejadores['POST /membresias'] = (c) => {
      const d = c as { email: string; nombre: string; rol: Membresia['rol'] };
      lista.push(membresia('m-nueva', d.nombre, d.rol));
      return { status: 201, cuerpo: { ...lista.at(-1), nuevoUsuario: true, correoEnviado: true } };
    };
    renderApp('/personas');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Agregar persona' }));
    await u.type(screen.getByLabelText('Nombre completo'), 'Nora Nueva');
    await u.type(screen.getByLabelText('Email'), 'nora@demo.test');
    await u.selectOptions(screen.getByLabelText('Rol'), 'CONTADORA');
    await u.click(screen.getByRole('button', { name: 'Guardar persona' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nora Nueva recibirá un correo');
    expect(await screen.findByText('Nora Nueva')).toBeInTheDocument();
    expect(s.llamadas.find((l) => l.clave === 'POST /membresias')?.cuerpo).toEqual({
      nombre: 'Nora Nueva',
      email: 'nora@demo.test',
      rol: 'CONTADORA',
    });
  });

  it('si el correo no se pudo enviar, avisa cómo definir la contraseña', async () => {
    const s = servidorAdmin();
    s.manejadores['POST /membresias'] = () => ({
      status: 201,
      cuerpo: {
        ...membresia('m-x', 'Nora', 'OPERACIONES'),
        nuevoUsuario: true,
        correoEnviado: false,
      },
    });
    renderApp('/personas');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Agregar persona' }));
    await u.type(screen.getByLabelText('Nombre completo'), 'Nora');
    await u.type(screen.getByLabelText('Email'), 'nora@demo.test');
    await u.click(screen.getByRole('button', { name: 'Guardar persona' }));
    expect(await screen.findByRole('status')).toHaveTextContent('no se pudo enviar el correo');
  });

  it('muestra el error de validación junto al campo', async () => {
    const s = servidorAdmin();
    s.manejadores['POST /membresias'] = () => ({
      status: 400,
      cuerpo: {
        mensaje: 'Datos inválidos',
        errores: [{ campo: 'email', mensaje: 'Email inválido' }],
      },
    });
    renderApp('/personas');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Agregar persona' }));
    await u.type(screen.getByLabelText('Nombre completo'), 'Nora');
    await u.type(screen.getByLabelText('Email'), 'malo');
    await u.click(screen.getByRole('button', { name: 'Guardar persona' }));
    expect(await screen.findByText('Email inválido')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('desactivar pide confirmación nombrando a la persona; cancelar no cambia nada', async () => {
    const s = servidorAdmin();
    s.manejadores['PATCH /membresias/m-asis'] = () => {
      lista[1] = { ...lista[1]!, activo: false };
      return { status: 200, cuerpo: lista[1] };
    };
    renderApp('/personas');
    const u = userEvent.setup();
    const fila = (await screen.findByText('Andrés Asistente')).closest('tr')!;
    const boton = within(fila).getByRole('button', { name: 'Desactivar' });

    await u.click(boton);
    expect(
      screen.getByRole('heading', { name: 'Desactivar a Andrés Asistente' }),
    ).toBeInTheDocument();
    await u.keyboard('{Escape}');
    await waitFor(() => expect(boton).toHaveFocus());
    expect(s.llamadas.some((l) => l.clave.startsWith('PATCH'))).toBe(false);

    await u.click(boton);
    await u.click(screen.getByRole('button', { name: 'Sí, desactivar' }));
    expect(await within(fila).findByText('Inactiva')).toBeInTheDocument();
    expect(within(fila).getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
  });

  it('no ofrece desactivar la propia membresía', async () => {
    servidorAdmin();
    renderApp('/personas');
    const fila = (await screen.findByText('ana@demo.test')).closest('tr')!;
    expect(within(fila).queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
  });

  it('concede Leer en Jurídica y lo muestra como concedido en los efectivos', async () => {
    const s = servidorAdmin();
    s.manejadores['POST /membresias/m-asis/permisos'] = (c) => {
      const d = c as { area: '04'; accion: 'leer'; efecto: 'CONCEDER' };
      lista[1] = {
        ...lista[1]!,
        permisos: [{ id: 'p1', expedienteId: null, createdAt: '', ...d }],
      };
      return { status: 201, cuerpo: lista[1]!.permisos[0] };
    };
    renderApp('/personas');
    const u = userEvent.setup();
    const fila = (await screen.findByText('Andrés Asistente')).closest('tr')!;
    await u.click(within(fila).getByRole('button', { name: 'Permisos' }));

    const panel = await screen.findByRole('region', { name: 'Permisos de Andrés Asistente' });
    expect(within(panel).getByRole('row', { name: /04 Jurídica y convivencia/ })).toHaveTextContent(
      'Sin acceso',
    );
    await u.selectOptions(within(panel).getByLabelText('Área'), '04');
    await u.selectOptions(within(panel).getByLabelText('Acción'), 'leer');
    await u.click(within(panel).getByRole('button', { name: 'Conceder' }));

    await waitFor(() =>
      expect(
        within(panel).getByRole('row', { name: /04 Jurídica y convivencia/ }),
      ).toHaveTextContent('Leer (concedido)'),
    );
    expect(within(panel).getByRole('button', { name: /Revocar/ })).toBeInTheDocument();
  });
});
