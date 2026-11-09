import type { RouteObject } from 'react-router';
import { Layout } from '@/componentes/Layout';
import { Ingresar } from '@/paginas/Ingresar';
import { Inicio } from '@/paginas/Inicio';
import { Mfa } from '@/paginas/Mfa';
import { MfaConfigurar } from '@/paginas/MfaConfigurar';
import { NoEncontrado } from '@/paginas/NoEncontrado';
import { Olvide } from '@/paginas/Olvide';
import { Personas } from '@/paginas/Personas';
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
      {
        element: <Layout />,
        children: [
          { path: '/', element: <Inicio /> },
          {
            path: '/personas',
            element: (
              <RequiereRol roles={['ADMINISTRADORA']}>
                <Personas />
              </RequiereRol>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <NoEncontrado /> },
];
