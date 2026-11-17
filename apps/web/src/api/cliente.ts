// Vite ajusta BASE_URL al prefijo publicado (por ejemplo, /zulu/ en producción).
// Así, la API permanece dentro del mismo subdirectorio de la aplicación.
export const BASE_API = `${import.meta.env.BASE_URL}api/v1`;

export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

/** Error del API con mensaje listo para mostrar en español. */
export class ErrorApi extends Error {
  readonly status: number;
  readonly errores?: ErrorCampo[];
  /** Cuerpo completo de la respuesta, para errores que traen datos (p. ej. posibles duplicados). */
  readonly cuerpo?: unknown;

  constructor(status: number, mensaje: string, errores?: ErrorCampo[], cuerpo?: unknown) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.errores = errores;
    this.cuerpo = cuerpo;
  }

  /** Mensaje de error de un campo concreto, si el API lo reportó. */
  deCampo(campo: string) {
    return this.errores?.find((e) => e.campo === campo)?.mensaje;
  }
}

interface ConfigCliente {
  obtenerToken: () => string | null;
  obtenerCondominio: () => string | null;
  /** Intenta renovar la sesión; true si hay un token nuevo. */
  renovar: () => Promise<boolean>;
  /** La renovación falló: la sesión terminó. */
  alTerminarSesion: () => void;
}

let config: ConfigCliente = {
  obtenerToken: () => null,
  obtenerCondominio: () => null,
  renovar: async () => false,
  alTerminarSesion: () => {},
};

export function configurarCliente(c: ConfigCliente) {
  config = c;
}

export interface OpcionesApi {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  cuerpo?: unknown;
  /** false en login/MFA/refresh: un 401 ahí es la respuesta, no una sesión vencida. */
  renovarEn401?: boolean;
}

const SIN_CONEXION = 'No se pudo conectar con el servidor. Revise su conexión.';
const ERROR_GENERICO = 'Ocurrió un error inesperado. Intente de nuevo.';

async function leerError(r: Response): Promise<ErrorApi> {
  let cuerpo: unknown;
  try {
    cuerpo = await r.json();
  } catch {
    /* sin cuerpo JSON */
  }
  const c = (cuerpo ?? {}) as { message?: unknown; mensaje?: unknown; errores?: ErrorCampo[] };
  const mensaje =
    typeof c.mensaje === 'string'
      ? c.mensaje
      : typeof c.message === 'string'
        ? c.message
        : r.status === 429
          ? 'Demasiados intentos. Espere un momento e intente de nuevo.'
          : ERROR_GENERICO;
  return new ErrorApi(r.status, mensaje, Array.isArray(c.errores) ? c.errores : undefined, cuerpo);
}

async function ejecutar(ruta: string, o: OpcionesApi): Promise<Response> {
  const headers = new Headers();
  const token = config.obtenerToken();
  const condominio = config.obtenerCondominio();
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (condominio) headers.set('x-condominio-id', condominio);
  const multipart = typeof FormData !== 'undefined' && o.cuerpo instanceof FormData;
  if (o.cuerpo !== undefined && !multipart) headers.set('content-type', 'application/json');
  try {
    return await fetch(`${BASE_API}${ruta}`, {
      method: o.metodo ?? 'GET',
      headers,
      body: o.cuerpo === undefined ? undefined : multipart ? o.cuerpo as FormData : JSON.stringify(o.cuerpo),
      credentials: 'same-origin',
    });
  } catch {
    throw new ErrorApi(0, SIN_CONEXION);
  }
}

/** Llama al API. Ante 401 renueva la sesión una vez y reintenta. */
export async function api<T = unknown>(ruta: string, o: OpcionesApi = {}): Promise<T> {
  let r = await ejecutar(ruta, o);
  if (r.status === 401 && o.renovarEn401 !== false) {
    if (await config.renovar()) {
      r = await ejecutar(ruta, o);
    } else {
      config.alTerminarSesion();
    }
  }
  if (!r.ok) throw await leerError(r);
  if (r.status === 204) return undefined as T;
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

/** Descarga autenticada para archivos binarios; conserva renovación y cabeceras del cliente. */
export async function apiArchivo(ruta: string): Promise<Blob> {
  let r = await ejecutar(ruta, {});
  if (r.status === 401) {
    if (await config.renovar()) r = await ejecutar(ruta, {});
    else config.alTerminarSesion();
  }
  if (!r.ok) throw await leerError(r);
  return r.blob();
}
