import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { authApi } from '@/api/auth';
import { ErrorApi } from '@/api/cliente';
import { MarcoAcceso } from '@/componentes/layout/MarcoAcceso';
import { Alerta, Boton, Campo } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { useSesion } from '@/sesion/SesionProvider';

export function Ingresar() {
  useTitulo('Ingresar');
  const { estado, iniciar } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const refPassword = useRef<HTMLInputElement>(null);
  const aviso = estado.tipo === 'anonimo' ? estado.aviso : undefined;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await iniciar(await authApi.login(email, password));
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo iniciar sesión.');
      setPassword('');
      refPassword.current?.focus();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MarcoAcceso titulo="Ingresar">
      <form onSubmit={enviar} noValidate className="d-flex flex-column gap-3">
        {aviso && !error && <Alerta tono="aviso">{aviso}</Alerta>}
        {error && <Alerta tono="error">{error}</Alerta>}
        <Campo
          etiqueta="Email"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          ref={refPassword}
          etiqueta="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Boton type="submit" cargando={enviando} disabled={!email || !password}>
          Ingresar
        </Boton>
        <Link to="/olvide" className="align-self-center small">
          Olvidé mi contraseña
        </Link>
      </form>
    </MarcoAcceso>
  );
}
