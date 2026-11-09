import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { authApi } from '@/api/auth';
import { ErrorApi } from '@/api/cliente';
import { MarcoAcceso } from '@/componentes/Layout';
import { Alerta, Boton, Campo } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { useSesion, useYo } from '@/sesion/SesionProvider';

export function Mfa() {
  useTitulo('Verificación en dos pasos');
  const yo = useYo();
  const { actualizarToken, salir } = useSesion();
  const [respaldo, setRespaldo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!yo.mfa.configurado) return <Navigate to="/mfa/configurar" replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await authApi.verificarMfa(codigo.trim());
      await actualizarToken(r.accessToken);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo verificar el código.');
      setCodigo('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MarcoAcceso titulo="Verificación en dos pasos">
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-texto-suave">
          {respaldo
            ? 'Ingrese uno de sus códigos de respaldo. Cada código sirve una sola vez.'
            : 'Abra su aplicación de autenticación e ingrese el código que muestra para ZULU ADMIN.'}
        </p>
        {error && <Alerta tono="error">{error}</Alerta>}
        {respaldo ? (
          <Campo
            key="respaldo"
            etiqueta="Código de respaldo"
            autoComplete="off"
            autoFocus
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        ) : (
          <Campo
            key="totp"
            etiqueta="Código de 6 dígitos"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          />
        )}
        <Boton type="submit" cargando={enviando} disabled={!codigo}>
          Verificar
        </Boton>
        <div className="flex justify-between">
          <Boton
            variante="enlace"
            onClick={() => {
              setRespaldo(!respaldo);
              setCodigo('');
              setError(null);
            }}
          >
            {respaldo ? 'Usar la aplicación de autenticación' : 'Usar un código de respaldo'}
          </Boton>
          <Boton variante="enlace" onClick={() => void salir()}>
            Salir
          </Boton>
        </div>
      </form>
    </MarcoAcceso>
  );
}
