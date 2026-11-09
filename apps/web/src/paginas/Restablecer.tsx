import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { authApi } from '@/api/auth';
import { ErrorApi } from '@/api/cliente';
import { MarcoAcceso } from '@/componentes/Layout';
import { Alerta, Boton, Campo } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';

const MINIMO = 12;

/** Definir contraseña: recuperación o bienvenida de una persona nueva. */
export function Restablecer() {
  useTitulo('Definir contraseña');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MINIMO)
      return setError(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
    if (password !== repetida) return setError('Las contraseñas no coinciden.');
    setEnviando(true);
    try {
      await authApi.restablecer(token, password);
      setListo(true);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar la contraseña.');
      setPassword('');
      setRepetida('');
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <MarcoAcceso titulo="Definir contraseña">
        <Alerta tono="error">
          El enlace está incompleto. Ábralo de nuevo desde su correo o solicite uno nuevo.
        </Alerta>
        <Link
          to="/olvide"
          className="mt-4 inline-block text-sm text-acento underline underline-offset-2"
        >
          Solicitar un enlace nuevo
        </Link>
      </MarcoAcceso>
    );
  }

  return (
    <MarcoAcceso titulo="Definir contraseña">
      {listo ? (
        <div className="flex flex-col gap-4">
          <Alerta tono="ok">
            Su contraseña quedó guardada. Por seguridad, se cerraron sus sesiones abiertas.
          </Alerta>
          <Link
            to="/ingresar"
            className="text-sm font-semibold text-acento underline underline-offset-2"
          >
            Ir a ingresar
          </Link>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          {error && <Alerta tono="error">{error}</Alerta>}
          <Campo
            etiqueta="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            ayuda={`Mínimo ${MINIMO} caracteres. Una frase fácil de recordar funciona bien.`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Campo
            etiqueta="Repita la contraseña"
            type="password"
            autoComplete="new-password"
            required
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
          />
          <Boton type="submit" cargando={enviando} disabled={!password || !repetida}>
            Guardar contraseña
          </Boton>
          <Link
            to="/olvide"
            className="self-center text-sm text-acento underline underline-offset-2"
          >
            Solicitar un enlace nuevo
          </Link>
        </form>
      )}
    </MarcoAcceso>
  );
}
