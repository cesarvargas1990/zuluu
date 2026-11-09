import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { authApi, type CondominioDeUsuario, type RespuestaLogin, type Yo } from '@/api/auth';
import { configurarCliente } from '@/api/cliente';
import { renovarSesion, token } from './token';

export type EstadoSesion =
  | { tipo: 'cargando' }
  | { tipo: 'anonimo'; aviso?: string }
  | { tipo: 'mfa'; yo: Yo }
  | { tipo: 'activa'; yo: Yo };

interface ValorSesion {
  estado: EstadoSesion;
  condominioActivo: CondominioDeUsuario | null;
  elegirCondominio: (condominioId: string) => void;
  /** Tras un login exitoso. */
  iniciar: (r: RespuestaLogin) => Promise<void>;
  /** Tras completar MFA: token con sesión elevada. */
  actualizarToken: (accessToken: string) => Promise<void>;
  salir: () => Promise<void>;
}

const Contexto = createContext<ValorSesion | null>(null);

export const SESION_TERMINADA = 'Su sesión terminó. Ingrese de nuevo.';
const claveCondominio = (usuarioId: string) => `zulu:condominio:${usuarioId}`;

function leerPreferencia(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardarPreferencia(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* almacenamiento no disponible: solo se pierde la preferencia */
  }
}

const estadoPara = (yo: Yo): EstadoSesion =>
  yo.mfa.requerido && !yo.mfa.verificado ? { tipo: 'mfa', yo } : { tipo: 'activa', yo };

export function SesionProvider({
  children,
  alSalir,
}: {
  children: ReactNode;
  alSalir?: () => void;
}) {
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' });
  const [elegido, setElegido] = useState<string | null>(null);
  const condominioRef = useRef<string | null>(null);

  const terminar = useCallback(
    (aviso?: string) => {
      token.fijar(null);
      setElegido(null);
      setEstado({ tipo: 'anonimo', aviso });
      alSalir?.();
    },
    [alSalir],
  );

  const cargarYo = useCallback(async () => {
    const yo = await authApi.yo();
    const preferido = leerPreferencia(claveCondominio(yo.id));
    const valido = yo.condominios.find((c) => c.condominioId === preferido) ?? yo.condominios[0];
    setElegido(valido?.condominioId ?? null);
    setEstado(estadoPara(yo));
  }, []);

  useEffect(() => {
    configurarCliente({
      obtenerToken: token.obtener,
      obtenerCondominio: () => condominioRef.current,
      renovar: renovarSesion,
      alTerminarSesion: () => terminar(SESION_TERMINADA),
    });
  }, [terminar]);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const ok = await renovarSesion();
      if (!vigente) return;
      if (!ok) return setEstado({ tipo: 'anonimo' });
      try {
        await cargarYo();
      } catch {
        if (vigente) setEstado({ tipo: 'anonimo' });
      }
    })();
    return () => {
      vigente = false;
    };
  }, [cargarYo]);

  const yo = estado.tipo === 'activa' || estado.tipo === 'mfa' ? estado.yo : null;
  const condominioActivo = yo?.condominios.find((c) => c.condominioId === elegido) ?? null;
  condominioRef.current = condominioActivo?.condominioId ?? null;

  const valor = useMemo<ValorSesion>(
    () => ({
      estado,
      condominioActivo,
      elegirCondominio: (id) => {
        if (!yo) return;
        guardarPreferencia(claveCondominio(yo.id), id);
        setElegido(id);
      },
      iniciar: async (r) => {
        token.fijar(r.accessToken);
        await cargarYo();
      },
      actualizarToken: async (t) => {
        token.fijar(t);
        await cargarYo();
      },
      salir: async () => {
        try {
          await authApi.logout();
        } catch {
          /* la sesión local se cierra igual */
        }
        terminar();
      },
    }),
    [estado, condominioActivo, yo, cargarYo, terminar],
  );

  return <Contexto value={valor}>{children}</Contexto>;
}

export function useSesion(): ValorSesion {
  const v = use(Contexto);
  if (!v) throw new Error('useSesion debe usarse dentro de <SesionProvider>');
  return v;
}

/** Yo de una sesión activa (lanza si no hay sesión: usar dentro de rutas protegidas). */
export function useYo(): Yo {
  const { estado } = useSesion();
  if (estado.tipo !== 'activa' && estado.tipo !== 'mfa') throw new Error('Sin sesión');
  return estado.yo;
}
