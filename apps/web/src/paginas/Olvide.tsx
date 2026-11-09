import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { authApi } from '@/api/auth';
import { ErrorApi } from '@/api/cliente';
import { MarcoAcceso } from '@/componentes/Layout';
import { Alerta, Boton, Campo } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';

export function Olvide() {
  useTitulo('Recuperar contraseña');
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      setMensaje((await authApi.recuperar(email)).mensaje);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar la solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MarcoAcceso titulo="Recuperar contraseña">
      {mensaje ? (
        <div className="flex flex-col gap-4">
          <Alerta tono="ok">{mensaje}</Alerta>
          <p className="text-sm text-texto-suave">
            El enlace vence en 30 minutos y sirve una sola vez.
          </p>
          <Link to="/ingresar" className="text-sm text-acento underline underline-offset-2">
            Volver a ingresar
          </Link>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-texto-suave">
            Le enviaremos un enlace para definir una contraseña nueva.
          </p>
          {error && <Alerta tono="error">{error}</Alerta>}
          <Campo
            etiqueta="Email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Boton type="submit" cargando={enviando} disabled={!email}>
            Enviar enlace
          </Boton>
          <Link
            to="/ingresar"
            className="self-center text-sm text-acento underline underline-offset-2"
          >
            Volver a ingresar
          </Link>
        </form>
      )}
    </MarcoAcceso>
  );
}
