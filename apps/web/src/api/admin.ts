import type { Rol } from '@zulu/shared';
import { api } from './cliente';

export interface CondominioAdmin {
  id: string;
  razonSocial: string;
  nit: string;
  creadoEn: string;
}

export interface RolDeUsuario {
  membresiaId: string;
  condominioId: string;
  razonSocial: string;
  rol: Rol;
  activo: boolean;
}

export interface UsuarioAdmin {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  esSuperadmin: boolean;
  /** Aún no definió su contraseña con el enlace de invitación. */
  invitacionPendiente: boolean;
  mfaConfigurado: boolean;
  creadoEn: string;
  roles: RolDeUsuario[];
}

export interface RolNuevo {
  condominioId: string;
  rol: Rol;
}

export const adminApi = {
  condominios: () => api<CondominioAdmin[]>('/admin/condominios'),
  crearCondominio: (datos: { razonSocial: string; nit: string }) =>
    api<CondominioAdmin>('/admin/condominios', { metodo: 'POST', cuerpo: datos }),
  usuarios: () => api<UsuarioAdmin[]>('/admin/usuarios'),
  crearUsuario: (datos: { nombre: string; email: string; roles: RolNuevo[] }) =>
    api<{ usuario: UsuarioAdmin; correoEnviado: boolean }>('/admin/usuarios', {
      metodo: 'POST',
      cuerpo: datos,
    }),
  cambiarEstado: (id: string, activo: boolean) =>
    api<{ id: string; activo: boolean }>(`/admin/usuarios/${id}`, {
      metodo: 'PATCH',
      cuerpo: { activo },
    }),
  reenviarInvitacion: (id: string) =>
    api<{ correoEnviado: boolean }>(`/admin/usuarios/${id}/invitacion`, { metodo: 'POST' }),
  asignarRol: (usuarioId: string, datos: RolNuevo) =>
    api<{ id: string }>(`/admin/usuarios/${usuarioId}/roles`, { metodo: 'POST', cuerpo: datos }),
  modificarMembresia: (
    membresiaId: string,
    datos: { condominioId: string; rol?: Rol; activo?: boolean },
  ) => api<{ id: string }>(`/admin/membresias/${membresiaId}`, { metodo: 'PATCH', cuerpo: datos }),
};
