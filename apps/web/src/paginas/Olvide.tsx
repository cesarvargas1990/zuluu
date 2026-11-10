import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { authApi } from '@/api/auth';
import { ErrorApi } from '@/api/cliente';
import { MarcoAcceso } from '@/componentes/layout/MarcoAcceso';
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
        <div className="d-flex flex-column gap-3">
          <Alerta tono="ok">{mensaje}</Alerta>
          <p className="small text-body-secondary mb-0">
            El enlace vence en 30 minutos y sirve una sola vez.
          </p>
          <Link to="/ingresar" className="small">
            Volver a ingresar
          </Link>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="d-flex flex-column gap-3">
          <p className="small text-body-secondary mb-0">
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
          <Link to="/ingresar" className="align-self-center small">
            Volver a ingresar
          </Link>
        </form>
      )}
    </MarcoAcceso>
  );
}
