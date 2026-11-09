import QRCode from 'qrcode';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { authApi } from '@/api/auth';
import { ErrorApi } from '@/api/cliente';
import { MarcoAcceso } from '@/componentes/Layout';
import { Alerta, Boton, Campo } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { useSesion, useYo } from '@/sesion/SesionProvider';

interface Registro {
  secreto: string;
  qr: string | null;
}

export function MfaConfigurar() {
  useTitulo('Configurar verificación en dos pasos');
  const yo = useYo();
  const { actualizarToken, salir } = useSesion();
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ codigos: string[]; token: string } | null>(null);
  const [guardados, setGuardados] = useState(false);
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current || yo.mfa.configurado) return;
    iniciado.current = true;
    authApi
      .iniciarMfa()
      .then(async (r) => {
        // El QR se genera en el navegador: el secreto no se envía a ningún servicio externo.
        const qr = await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 200 }).catch(
          () => null,
        );
        setRegistro({ secreto: r.secreto, qr });
      })
      .catch((err) =>
        setError(err instanceof ErrorApi ? err.message : 'No se pudo iniciar la configuración.'),
      );
  }, [yo.mfa.configurado]);

  if (yo.mfa.configurado && !resultado) return <Navigate to="/mfa" replace />;

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await authApi.confirmarMfa(codigo);
      setResultado({ codigos: r.codigosRespaldo, token: r.accessToken });
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo activar la verificación.');
      setCodigo('');
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    const texto = `Códigos de respaldo ZULU ADMIN (${yo.email})\nCada código sirve una sola vez.\n\n${resultado.codigos.join('\n')}\n`;
    return (
      <MarcoAcceso titulo="Guarde sus códigos de respaldo">
        <div className="flex flex-col gap-4">
          <Alerta tono="ok">La verificación en dos pasos quedó activa.</Alerta>
          <p className="text-sm text-texto-suave">
            Si pierde su teléfono, podrá entrar con uno de estos códigos. Cada uno sirve una sola
            vez y <strong>no se volverán a mostrar</strong>.
          </p>
          <ol className="grid grid-cols-2 gap-2 rounded-md bg-fondo p-4 font-mono text-sm">
            {resultado.codigos.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3">
            <Boton variante="secundario" onClick={() => void navigator.clipboard?.writeText(texto)}>
              Copiar
            </Boton>
            <a
              className="inline-flex min-h-11 items-center rounded-md border border-borde px-4 text-sm font-semibold"
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(texto)}`}
              download="codigos-respaldo-zulu-admin.txt"
            >
              Descargar
            </a>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={guardados}
              onChange={(e) => setGuardados(e.target.checked)}
            />
            Guardé mis códigos de respaldo en un lugar seguro
          </label>
          <Boton disabled={!guardados} onClick={() => void actualizarToken(resultado.token)}>
            Continuar
          </Boton>
        </div>
      </MarcoAcceso>
    );
  }

  return (
    <MarcoAcceso titulo="Proteja su cuenta">
      <form onSubmit={confirmar} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-texto-suave">
          Su perfil requiere verificación en dos pasos. Escanee el código con una aplicación de
          autenticación (Google Authenticator, Microsoft Authenticator u otra) o escriba la clave
          manualmente.
        </p>
        {error && <Alerta tono="error">{error}</Alerta>}
        {registro ? (
          <div className="flex flex-col items-center gap-3">
            {registro.qr && (
              <img
                src={registro.qr}
                width={200}
                height={200}
                alt="Código QR para la aplicación de autenticación"
              />
            )}
            <p className="text-sm">
              Clave:{' '}
              <code className="rounded bg-fondo px-2 py-1 font-mono break-all">
                {registro.secreto}
              </code>
            </p>
          </div>
        ) : (
          !error && <p role="status">Preparando…</p>
        )}
        <Campo
          etiqueta="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
        />
        <Boton type="submit" cargando={enviando} disabled={codigo.length !== 6 || !registro}>
          Activar verificación
        </Boton>
        <Boton variante="enlace" className="self-center" onClick={() => void salir()}>
          Salir
        </Boton>
      </form>
    </MarcoAcceso>
  );
}
