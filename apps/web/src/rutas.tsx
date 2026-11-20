import type { RouteObject } from 'react-router';
import { AppShell } from '@/componentes/layout/AppShell';
import { AdminCondominios } from '@/paginas/admin/AdminCondominios';
import { AdminGrupos } from '@/paginas/admin/AdminGrupos';
import { AdminParametros } from '@/paginas/admin/AdminParametros';
import { AdminUsuarios } from '@/paginas/admin/AdminUsuarios';
import { ElegirCondominio } from '@/paginas/ElegirCondominio';
import { Ingresar } from '@/paginas/Ingresar';
import { Inicio } from '@/paginas/Inicio';
import { Mfa } from '@/paginas/Mfa';
import { MfaConfigurar } from '@/paginas/MfaConfigurar';
import { NoEncontrado } from '@/paginas/NoEncontrado';
import { Olvide } from '@/paginas/Olvide';
import { Personas } from '@/paginas/Personas';
import { Propietarios } from '@/paginas/Propietarios';
import { Recaudos } from '@/paginas/Recaudos';
import { Cartera } from '@/paginas/Cartera';
import { CuentasCobro } from '@/paginas/CuentasCobro';
import { Restablecer } from '@/paginas/Restablecer';
import {
  RequiereAnonimo,
  RequiereMfaPendiente,
  RequiereRol,
  RequiereSesion,
} from '@/sesion/rutas-protegidas';

export const rutas: RouteObject[] = [
  {
    element: <RequiereAnonimo />,
    children: [
      { path: '/ingresar', element: <Ingresar /> },
      { path: '/olvide', element: <Olvide /> },
    ],
  },
  { path: '/restablecer', element: <Restablecer /> },
  {
    element: <RequiereMfaPendiente />,
    children: [
      { path: '/mfa', element: <Mfa /> },
      { path: '/mfa/configurar', element: <MfaConfigurar /> },
    ],
  },
  {
    element: <RequiereSesion />,
    children: [
      { path: '/elegir-condominio', element: <ElegirCondominio /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Inicio /> },
          {
            path: '/propietarios',
            element: (
              <RequiereRol roles={['ADMINISTRADORA', 'ASISTENTE', 'CONTADORA']}>
                <Propietarios />
              </RequiereRol>
            ),
          },
          {
            path: '/recaudos',
            element: (
              <RequiereRol roles={['ADMINISTRADORA', 'ASISTENTE', 'CONTADORA']}>
                <Recaudos />
              </RequiereRol>
            ),
          },
          {
            path: '/cartera',
            element: (
              <RequiereRol roles={['ADMINISTRADORA', 'ASISTENTE', 'CONTADORA']}>
                <Cartera />
              </RequiereRol>
            ),
          },
          {
            path: '/cuentas-cobro',
            element: (
              <RequiereRol roles={['ADMINISTRADORA', 'ASISTENTE', 'CONTADORA']}>
                <CuentasCobro />
              </RequiereRol>
            ),
          },
          {
            path: '/personas',
            element: (
              <RequiereRol roles={['ADMINISTRADORA']}>
                <Personas />
              </RequiereRol>
            ),
          },
          {
            path: '/admin/usuarios',
            element: (
              <RequiereRol roles={[]} superadmin>
                <AdminUsuarios />
              </RequiereRol>
            ),
          },
          {
            path: '/admin/parametros',
            element: (
              <RequiereRol roles={[]} superadmin>
                <AdminParametros />
              </RequiereRol>
            ),
          },
          {
            path: '/admin/grupos',
            element: (
              <RequiereRol roles={[]} superadmin>
                <AdminGrupos />
              </RequiereRol>
            ),
          },
          {
            path: '/admin/condominios',
            element: (
              <RequiereRol roles={[]} superadmin>
                <AdminCondominios />
              </RequiereRol>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <NoEncontrado /> },
];
