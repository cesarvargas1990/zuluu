import QRCode from 'qrcode';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { authApi } from '@/api/auth';
import { ErrorApi } from '@/api/cliente';
import { MarcoAcceso } from '@/componentes/layout/MarcoAcceso';
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
        <div className="d-flex flex-column gap-3">
          <Alerta tono="ok">La verificación en dos pasos quedó activa.</Alerta>
          <p className="small text-body-secondary mb-0">
            Si pierde su teléfono, podrá entrar con uno de estos códigos. Cada uno sirve una sola
            vez y <strong>no se volverán a mostrar</strong>.
          </p>
          <ol className="row row-cols-2 g-2 list-unstyled bg-body-tertiary rounded p-3 font-monospace small m-0">
            {resultado.codigos.map((c) => (
              <li key={c} className="col">
                {c}
              </li>
            ))}
          </ol>
          <div className="d-flex flex-wrap gap-2">
            <Boton variante="secundario" onClick={() => void navigator.clipboard?.writeText(texto)}>
              Copiar
            </Boton>
            <a
              className="btn btn-outline-secondary"
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(texto)}`}
              download="codigos-respaldo-zulu-admin.txt"
            >
              Descargar
            </a>
          </div>
          <label className="d-flex align-items-start gap-2 small">
            <input
              type="checkbox"
              className="form-check-input mt-0 flex-shrink-0"
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
      <form onSubmit={confirmar} noValidate className="d-flex flex-column gap-3">
        <p className="small text-body-secondary mb-0">
          Su perfil requiere verificación en dos pasos. Escanee el código con una aplicación de
          autenticación (Google Authenticator, Microsoft Authenticator u otra) o escriba la clave
          manualmente.
        </p>
        {error && <Alerta tono="error">{error}</Alerta>}
        {registro ? (
          <div className="d-flex flex-column align-items-center gap-3">
            {registro.qr && (
              <img
                src={registro.qr}
                width={200}
                height={200}
                alt="Código QR para la aplicación de autenticación"
              />
            )}
            <p className="small mb-0">
              Clave:{' '}
              <code className="bg-body-tertiary text-body rounded px-2 py-1 text-break fw-semibold">
                {registro.secreto}
              </code>
            </p>
          </div>
        ) : (
          !error && (
            <p role="status" className="text-body-secondary mb-0">
              Preparando…
            </p>
          )
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
        <Boton variante="enlace" className="align-self-center" onClick={() => void salir()}>
          Salir
        </Boton>
      </form>
    </MarcoAcceso>
  );
}
