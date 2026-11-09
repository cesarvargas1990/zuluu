import { NavLink, Outlet } from 'react-router';
import { useSesion, useYo } from '@/sesion/SesionProvider';
import { NOMBRE_ROL } from '@/permisos/etiquetas';
import { Logo } from './Logo';
import { Boton } from './ui';

const enlace = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10 hover:text-white'}`;

export function Layout() {
  const yo = useYo();
  const { condominioActivo, elegirCondominio, salir } = useSesion();
  const esAdministradora = condominioActivo?.rol === 'ADMINISTRADORA';

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded focus:bg-superficie focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <header className="bg-marca text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Logo className="h-10 w-auto" conSubtitulo={false} />
          <nav aria-label="Principal" className="flex gap-1">
            <NavLink to="/" end className={enlace}>
              Inicio
            </NavLink>
            {esAdministradora && (
              <NavLink to="/personas" className={enlace}>
                Personas y permisos
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {yo.condominios.length > 1 ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-white/85">Condominio</span>
                <select
                  value={condominioActivo?.condominioId ?? ''}
                  onChange={(e) => elegirCondominio(e.target.value)}
                  className="min-h-10 rounded-md border border-white/30 bg-marca px-2 text-white"
                >
                  {yo.condominios.map((c) => (
                    <option key={c.condominioId} value={c.condominioId}>
                      {c.razonSocial}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              condominioActivo && (
                <span className="text-sm text-white/85">{condominioActivo.razonSocial}</span>
              )
            )}
            <div className="text-right text-sm leading-tight">
              <p className="font-semibold">{yo.nombre}</p>
              <p className="text-white/75">
                {yo.esSuperadmin
                  ? 'Superadministrador ZULU'
                  : condominioActivo
                    ? NOMBRE_ROL[condominioActivo.rol]
                    : 'Sin condominio'}
              </p>
            </div>
            <Boton variante="secundario" className="min-h-10" onClick={() => void salir()}>
              Salir
            </Boton>
          </div>
        </div>
        <div aria-hidden="true" className="flex h-1">
          <span className="flex-1 bg-lima" />
          <span className="flex-1 bg-naranja" />
        </div>
      </header>
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

/** Marco de las pantallas de acceso (sin sesión). */
export function MarcoAcceso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="grid size-36 place-items-center rounded-full bg-marca text-white shadow-md">
        <Logo className="w-28" />
      </div>
      <main className="w-full max-w-md rounded-lg border border-borde bg-superficie p-6 shadow-sm sm:p-8">
        <h1 className="mb-6 text-2xl font-semibold">{titulo}</h1>
        {children}
      </main>
      <p className="text-xs text-texto-suave">ZULU ADMIN · Majagua Digital</p>
    </div>
  );
}
