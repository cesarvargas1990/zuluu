import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CondominioAdmin, UsuarioAdmin } from '@/api/admin';
import { renderApp, servidorFalso, yoDe } from '@/test/utilidades';

const yoSuperadmin = yoDe({
  id: 'sa',
  nombre: 'César Vargas',
  esSuperadmin: true,
  mfa: { requerido: true, configurado: true, verificado: true },
  condominios: [],
});

const condominios: CondominioAdmin[] = [
  {
    id: 'c1',
    razonSocial: 'Majagua Villa Campestre',
    nit: '900123456-7',
    creadoEn: '2026-11-10T00:00:00Z',
  },
];

const usuario = (id: string, nombre: string, extra: Partial<UsuarioAdmin> = {}): UsuarioAdmin => ({
  id,
  email: `${id}@demo.test`,
  nombre,
  activo: true,
  esSuperadmin: false,
  invitacionPendiente: false,
  mfaConfigurado: false,
  mfaPolitica: 'HEREDAR',
  mfaRequerido: false,
  mfaMotivo: 'NINGUNO',
  creadoEn: '2026-11-10T00:00:00Z',
  roles: [],
  ...extra,
});

let usuarios: UsuarioAdmin[];
function servidor() {
  return servidorFalso({
    'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
    'GET /auth/yo': () => ({ status: 200, cuerpo: yoSuperadmin }),
    'GET /admin/usuarios': () => ({ status: 200, cuerpo: usuarios }),
    'GET /admin/condominios': () => ({ status: 200, cuerpo: condominios }),
  });
}

beforeEach(() => {
  localStorage.clear();
  usuarios = [
    usuario('sa', 'César Vargas', { esSuperadmin: true, email: 'admin@demo.test' }),
    usuario('u2', 'Ana Administradora', {
      roles: [
        {
          membresiaId: 'm1',
          condominioId: 'c1',
          razonSocial: 'Majagua Villa Campestre',
          rol: 'ADMINISTRADORA',
          activo: true,
        },
      ],
    }),
  ];
});

describe('Administración de usuarios (superadmin)', () => {
  it('el superadmin ve la sección en el menú; una administradora no', async () => {
    servidor();
    renderApp('/');
    const menu = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(menu).getByRole('link', { name: 'Usuarios' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Condominios' })).toBeInTheDocument();
    expect(
      within(menu).queryByRole('link', { name: 'Personas y permisos' }),
    ).not.toBeInTheDocument();
  });

  it('una administradora de condominio no accede a /admin/usuarios', async () => {
    servidorFalso({
      'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
      'GET /auth/yo': () => ({
        status: 200,
        cuerpo: yoDe({
          condominios: [{ condominioId: 'c1', razonSocial: 'Majagua', rol: 'ADMINISTRADORA' }],
        }),
      }),
    });
    renderApp('/admin/usuarios');
    expect(
      await screen.findByRole('heading', { name: 'No tiene acceso a esta sección' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('lista usuarios con sus roles por condominio y el estado en texto', async () => {
    usuarios.push(usuario('u3', 'Nora Nueva', { invitacionPendiente: true }));
    servidor();
    renderApp('/admin/usuarios');
    const fila = (await screen.findByText('Ana Administradora')).closest('tr')!;
    expect(within(fila).getByText(/Majagua Villa Campestre · Administrador/)).toBeInTheDocument();
    const nora = screen.getByText('Nora Nueva').closest('tr')!;
    expect(within(nora).getByText('Invitación pendiente')).toBeInTheDocument();
  });

  it('crea un usuario con rol y confirma que se envió el correo', async () => {
    const s = servidor();
    s.manejadores['POST /admin/usuarios'] = (c) => {
      const d = c as { nombre: string; email: string };
      const nuevo = usuario('u9', d.nombre, { email: d.email, invitacionPendiente: true });
      usuarios.push(nuevo);
      return { status: 201, cuerpo: { usuario: nuevo, correoEnviado: true } };
    };
    renderApp('/admin/usuarios');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Crear usuario' }));
    await u.type(screen.getByLabelText('Nombre completo'), 'Nora Nueva');
    await u.type(screen.getByLabelText('Email'), 'nora@demo.test');
    await u.selectOptions(screen.getByLabelText('Condominio del rol 1'), 'c1');
    await u.selectOptions(screen.getByLabelText('Rol 1'), 'CONTADORA');
    await u.click(screen.getByRole('button', { name: 'Crear y enviar invitación' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Le enviamos a nora@demo.test un correo con las instrucciones',
    );
    expect(s.llamadas.find((l) => l.clave === 'POST /admin/usuarios')?.cuerpo).toEqual({
      nombre: 'Nora Nueva',
      email: 'nora@demo.test',
      roles: [{ condominioId: 'c1', rol: 'CONTADORA' }],
    });
    expect(await screen.findByText('Nora Nueva')).toBeInTheDocument();
  });

  it('si el correo falla avisa y permite reenviar la invitación', async () => {
    const s = servidor();
    s.manejadores['POST /admin/usuarios'] = (c) => {
      const d = c as { nombre: string; email: string };
      const nuevo = usuario('u9', d.nombre, { email: d.email, invitacionPendiente: true });
      usuarios.push(nuevo);
      return { status: 201, cuerpo: { usuario: nuevo, correoEnviado: false } };
    };
    s.manejadores['POST /admin/usuarios/u9/invitacion'] = () => ({
      status: 200,
      cuerpo: { correoEnviado: true },
    });
    renderApp('/admin/usuarios');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Crear usuario' }));
    await u.type(screen.getByLabelText('Nombre completo'), 'Nora Nueva');
    await u.type(screen.getByLabelText('Email'), 'nora@demo.test');
    await u.click(screen.getByRole('button', { name: 'Crear y enviar invitación' }));
    expect(await screen.findByRole('status')).toHaveTextContent('no se pudo enviar el correo');

    const fila = (await screen.findByText('Nora Nueva')).closest('tr')!;
    await u.click(within(fila).getByRole('button', { name: 'Reenviar invitación' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Invitación reenviada a nora@demo.test'),
    );
  });

  it('asigna un rol desde el panel de roles del usuario', async () => {
    usuarios.push(usuario('u3', 'Sin Rol'));
    const s = servidor();
    s.manejadores['POST /admin/usuarios/u3/roles'] = (c) => {
      const d = c as { condominioId: string; rol: 'ASISTENTE' };
      usuarios[2] = {
        ...usuarios[2]!,
        roles: [{ membresiaId: 'm9', razonSocial: 'Majagua Villa Campestre', activo: true, ...d }],
      };
      return { status: 201, cuerpo: { id: 'm9', activo: true, ...d } };
    };
    renderApp('/admin/usuarios');
    const u = userEvent.setup();
    const fila = (await screen.findByText('Sin Rol')).closest('tr')!;
    await u.click(within(fila).getByRole('button', { name: 'Roles' }));
    const panel = await screen.findByRole('region', { name: 'Roles de Sin Rol' });
    await u.selectOptions(within(panel).getByLabelText('Condominio'), 'c1');
    await u.selectOptions(within(panel).getByLabelText('Rol'), 'ASISTENTE');
    await u.click(within(panel).getByRole('button', { name: 'Asignar rol' }));
    expect(
      await within(fila).findByText(/Majagua Villa Campestre · Asistente administrativo/),
    ).toBeInTheDocument();
  });

  it('desactivar un usuario pide confirmación con su nombre y no se ofrece para sí mismo', async () => {
    const s = servidor();
    s.manejadores['PATCH /admin/usuarios/u2'] = () => {
      usuarios[1] = { ...usuarios[1]!, activo: false };
      return { status: 200, cuerpo: { id: 'u2', activo: false } };
    };
    renderApp('/admin/usuarios');
    const u = userEvent.setup();
    const propia = (await screen.findByText('admin@demo.test')).closest('tr')!;
    expect(within(propia).queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();

    const fila = screen.getByText('Ana Administradora').closest('tr')!;
    await u.click(within(fila).getByRole('button', { name: 'Desactivar' }));
    expect(
      screen.getByRole('heading', { name: 'Desactivar a Ana Administradora' }),
    ).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Sí, desactivar' }));
    expect(await within(fila).findByText('Inactivo')).toBeInTheDocument();
  });
});
