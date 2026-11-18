import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UsuarioAdmin } from '@/api/admin';
import { renderApp, servidorFalso, yoDe } from '@/test/utilidades';

// Datos ficticios.
const yoSuper = yoDe({
  id: 'sa',
  nombre: 'Súper Admin',
  esSuperadmin: true,
  mfa: { requerido: true, configurado: true, verificado: true },
  condominios: [],
});

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

let global: boolean;
let usuarios: UsuarioAdmin[];

function servidor() {
  const s = servidorFalso({
    'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
    'GET /auth/yo': () => ({ status: 200, cuerpo: yoSuper }),
    'GET /admin/parametros': () => ({
      status: 200,
      cuerpo: {
        mfa: { global, actualizadoEn: '2026-11-18T15:00:00Z', actualizadoPorNombre: 'Súper Admin' },
      },
    }),
    'GET /admin/usuarios': () => ({ status: 200, cuerpo: usuarios }),
  });
  s.manejadores['PATCH /admin/parametros/mfa'] = (c) => {
    global = (c as { activo: boolean }).activo;
    return { status: 200, cuerpo: { global, actualizadoEn: null, actualizadoPorNombre: null } };
  };
  s.manejadores['PATCH /admin/usuarios/u-asis/mfa'] = (c) => {
    const politica = (c as { politica: UsuarioAdmin['mfaPolitica'] }).politica;
    usuarios[1] = {
      ...usuarios[1]!,
      mfaPolitica: politica,
      mfaRequerido: global && politica === 'OBLIGATORIO',
      mfaMotivo: global ? 'USUARIO_OBLIGATORIO' : 'GLOBAL_APAGADO',
    };
    return { status: 200, cuerpo: usuarios[1] };
  };
  return s;
}

beforeEach(() => {
  localStorage.clear();
  global = true;
  usuarios = [
    usuario('u-ana', 'Ana Administradora', {
      roles: [
        {
          membresiaId: 'm1',
          condominioId: 'c1',
          razonSocial: 'Las Palmas',
          rol: 'ADMINISTRADORA',
          activo: true,
        },
      ],
      mfaRequerido: true,
      mfaMotivo: 'ROL',
      mfaConfigurado: true,
    }),
    usuario('u-asis', 'Andrés Asistente', {
      roles: [
        {
          membresiaId: 'm2',
          condominioId: 'c1',
          razonSocial: 'Las Palmas',
          rol: 'ASISTENTE',
          activo: true,
        },
      ],
    }),
  ];
});

describe('Parámetros generales · 2FA', () => {
  it('una asistente no ve el menú ni la pantalla', async () => {
    servidorFalso({
      'POST /auth/refresh': () => ({ status: 200, cuerpo: { accessToken: 't' } }),
      'GET /auth/yo': () => ({ status: 200, cuerpo: yoDe() }),
    });
    renderApp('/admin/parametros');
    expect(
      await screen.findByRole('heading', { name: 'No tiene acceso a esta sección' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Parámetros generales' })).not.toBeInTheDocument();
  });

  it('muestra el control general y el estado de cada persona en texto', async () => {
    servidor();
    renderApp('/admin/parametros');
    expect(await screen.findByLabelText('Control general encendido')).toBeChecked();
    expect(screen.getByRole('link', { name: 'Parámetros generales' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const ana = (await screen.findByText('Ana Administradora')).closest('tr')!;
    expect(within(ana).getByText('Se exige')).toBeInTheDocument();
    expect(within(ana).getByText('Lo exige su rol')).toBeInTheDocument();
    const asis = screen.getByText('Andrés Asistente').closest('tr')!;
    expect(within(asis).getByText('No se exige')).toBeInTheDocument();
    expect(within(asis).getByText('Su rol no lo exige')).toBeInTheDocument();
  });

  it('exigir 2FA a una persona guarda su ajuste', async () => {
    const s = servidor();
    renderApp('/admin/parametros');
    const u = userEvent.setup();
    await u.selectOptions(
      await screen.findByLabelText('Ajuste de 2FA de Andrés Asistente'),
      'OBLIGATORIO',
    );
    expect(await screen.findByText('Se guardó el ajuste de Andrés Asistente.')).toBeInTheDocument();
    expect(s.llamadas.find((l) => l.clave === 'PATCH /admin/usuarios/u-asis/mfa')!.cuerpo).toEqual({
      politica: 'OBLIGATORIO',
    });
    const fila = screen.getByText('Andrés Asistente').closest('tr')!;
    await waitFor(() => expect(within(fila).getByText('Se exige')).toBeInTheDocument());
    expect(within(fila).getByText('Lo exige el ajuste de esta persona')).toBeInTheDocument();
  });

  it('apagar pide confirmación y deja claro que el ajuste individual no se aplica', async () => {
    const s = servidor();
    renderApp('/admin/parametros');
    const u = userEvent.setup();
    await u.click(await screen.findByLabelText('Control general encendido'));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/Nadie necesitará un código adicional/)).toBeInTheDocument();
    expect(s.llamadas.some((l) => l.clave === 'PATCH /admin/parametros/mfa')).toBe(false);
    await u.click(within(dialogo).getByRole('button', { name: 'Sí, apagar para todo el sistema' }));

    expect(
      await screen.findByText('Verificación en dos pasos desactivada para todo el sistema.'),
    ).toBeInTheDocument();
    expect(s.llamadas.find((l) => l.clave === 'PATCH /admin/parametros/mfa')!.cuerpo).toEqual({
      activo: false,
    });
    expect(await screen.findByLabelText('Control general apagado')).not.toBeChecked();
    expect(
      screen.getByText(/Ninguna persona necesita 2FA mientras el control general esté apagado/),
    ).toBeInTheDocument();
  });

  it('cancelar la confirmación no cambia nada; encender no pide confirmación', async () => {
    const s = servidor();
    renderApp('/admin/parametros');
    const u = userEvent.setup();
    await u.click(await screen.findByLabelText('Control general encendido'));
    await u.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );
    expect(s.llamadas.some((l) => l.clave === 'PATCH /admin/parametros/mfa')).toBe(false);
    expect(screen.getByLabelText('Control general encendido')).toBeChecked();
  });

  it('con el control apagado, volver a encenderlo es directo', async () => {
    global = false;
    const s = servidor();
    renderApp('/admin/parametros');
    const u = userEvent.setup();
    await u.click(await screen.findByLabelText('Control general apagado'));
    expect(await screen.findByText(/Verificación en dos pasos activada/)).toBeInTheDocument();
    expect(s.llamadas.find((l) => l.clave === 'PATCH /admin/parametros/mfa')!.cuerpo).toEqual({
      activo: true,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
