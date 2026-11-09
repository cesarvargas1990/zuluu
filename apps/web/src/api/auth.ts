import type { Rol } from '@zulu/shared';
import { api } from './cliente';

export interface CondominioDeUsuario {
  condominioId: string;
  razonSocial: string;
  rol: Rol;
}

export interface Yo {
  id: string;
  email: string;
  nombre: string;
  esSuperadmin: boolean;
  mfa: { requerido: boolean; configurado: boolean; verificado: boolean };
  condominios: CondominioDeUsuario[];
}

export interface RespuestaLogin {
  accessToken: string;
  mfaRequerido: boolean;
  mfaConfigurado: boolean;
}

/** En estos endpoints un 401 es la respuesta (credencial o código incorrecto), no una sesión vencida. */
const sinRenovar = { renovarEn401: false } as const;

export const authApi = {
  login: (email: string, password: string) =>
    api<RespuestaLogin>('/auth/login', {
      metodo: 'POST',
      cuerpo: { email, password },
      ...sinRenovar,
    }),
  refresh: () => api<{ accessToken: string }>('/auth/refresh', { metodo: 'POST', ...sinRenovar }),
  yo: () => api<Yo>('/auth/yo'),
  logout: () => api<void>('/auth/logout', { metodo: 'POST', ...sinRenovar }),
  iniciarMfa: () =>
    api<{ secreto: string; otpauthUrl: string }>('/auth/mfa/registro', { metodo: 'POST' }),
  confirmarMfa: (codigo: string) =>
    api<{ codigosRespaldo: string[]; accessToken: string }>('/auth/mfa/confirmar', {
      metodo: 'POST',
      cuerpo: { codigo },
      ...sinRenovar,
    }),
  verificarMfa: (codigo: string) =>
    api<{ accessToken: string }>('/auth/mfa/verificar', {
      metodo: 'POST',
      cuerpo: { codigo },
      ...sinRenovar,
    }),
  recuperar: (email: string) =>
    api<{ mensaje: string }>('/auth/recuperar', {
      metodo: 'POST',
      cuerpo: { email },
      ...sinRenovar,
    }),
  restablecer: (token: string, password: string) =>
    api<void>('/auth/restablecer', { metodo: 'POST', cuerpo: { token, password }, ...sinRenovar }),
};
