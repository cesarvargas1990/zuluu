import { authApi } from '@/api/auth';
import { crearRenovador } from '@/api/renovacion';

/** Token de acceso solo en memoria (nunca en localStorage). */
let tokenAcceso: string | null = null;

export const token = {
  obtener: () => tokenAcceso,
  fijar: (t: string | null) => {
    tokenAcceso = t;
  },
};

/** Renovación compartida por toda la app (y serializada entre pestañas). */
export const renovarSesion = crearRenovador(async () => {
  try {
    const r = await authApi.refresh();
    tokenAcceso = r.accessToken;
    return true;
  } catch {
    tokenAcceso = null;
    return false;
  }
});
