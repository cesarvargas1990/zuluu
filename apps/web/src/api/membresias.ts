import type { Accion, AreaCodigo, Rol } from '@zulu/shared';
import { api } from './cliente';

export type Efecto = 'CONCEDER' | 'RESTRINGIR';

export interface PermisoExplicito {
  id: string;
  area: AreaCodigo;
  accion: Accion;
  efecto: Efecto;
  expedienteId: string | null;
  createdAt: string;
}

export interface Membresia {
  id: string;
  condominioId: string;
  rol: Rol;
  activo: boolean;
  createdAt: string;
  usuario: { id: string; email: string; nombre: string; activo: boolean };
  permisos: PermisoExplicito[];
}

export const membresiasApi = {
  listar: () => api<Membresia[]>('/membresias'),
  crear: (datos: { email: string; nombre: string; rol: Rol }) =>
    api<Membresia & { nuevoUsuario: boolean; correoEnviado: boolean | null }>('/membresias', {
      metodo: 'POST',
      cuerpo: datos,
    }),
  modificar: (id: string, cambios: { activo?: boolean; rol?: Rol }) =>
    api<Membresia>(`/membresias/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  crearPermiso: (
    membresiaId: string,
    datos: { area: AreaCodigo; accion: Accion; efecto: Efecto; expedienteId?: string },
  ) =>
    api<PermisoExplicito>(`/membresias/${membresiaId}/permisos`, { metodo: 'POST', cuerpo: datos }),
  revocarPermiso: (permisoId: string) =>
    api<PermisoExplicito>(`/membresias/permisos/${permisoId}/revocar`, { metodo: 'POST' }),
};
