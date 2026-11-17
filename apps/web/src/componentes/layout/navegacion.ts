import type { Rol } from '@zulu/shared';

export interface ItemMenu {
  ruta: string;
  texto: string;
  icono: string;
  /** Roles que lo ven; sin valor = todos. */
  roles?: Rol[];
  /** Solo el superadministrador ZULU. */
  soloSuperadmin?: boolean;
}

export interface SeccionMenu {
  titulo: string;
  items: ItemMenu[];
}

/** Menú lateral. Los módulos M01–M10 se agregan aquí a medida que se construyan. */
export const MENU: SeccionMenu[] = [
  { titulo: 'General', items: [{ ruta: '/', texto: 'Inicio', icono: 'bi-speedometer2' }] },
  {
    titulo: 'Gestión del condominio',
    items: [
      {
        ruta: '/propietarios',
        texto: 'Propietarios y unidades',
        icono: 'bi-houses',
        roles: ['ADMINISTRADORA', 'ASISTENTE', 'CONTADORA'],
      },
      {
        ruta: '/recaudos',
        texto: 'Pagos y recaudos',
        icono: 'bi-cash-coin',
        roles: ['ADMINISTRADORA', 'ASISTENTE', 'CONTADORA'],
      },
      {
        ruta: '/cartera',
        texto: 'Gestión de cartera',
        icono: 'bi-bank',
        roles: ['ADMINISTRADORA', 'ASISTENTE', 'CONTADORA'],
      },
    ],
  },
  {
    titulo: 'Configuración',
    items: [
      {
        ruta: '/personas',
        texto: 'Personas y permisos',
        icono: 'bi-people',
        roles: ['ADMINISTRADORA'],
      },
    ],
  },
  {
    titulo: 'Administración ZULU',
    items: [
      { ruta: '/admin/usuarios', texto: 'Usuarios', icono: 'bi-person-gear', soloSuperadmin: true },
      {
        ruta: '/admin/condominios',
        texto: 'Condominios',
        icono: 'bi-buildings',
        soloSuperadmin: true,
      },
    ],
  },
];

export function menuPara(rol: Rol | undefined, esSuperadmin = false): SeccionMenu[] {
  const visible = (i: ItemMenu) =>
    i.soloSuperadmin ? esSuperadmin : !i.roles || (rol !== undefined && i.roles.includes(rol));
  return MENU.map((s) => ({ ...s, items: s.items.filter(visible) })).filter(
    (s) => s.items.length > 0,
  );
}
