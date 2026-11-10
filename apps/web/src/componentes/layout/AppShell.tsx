import { useState } from 'react';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { Outlet } from 'react-router';
import { NOMBRE_ROL } from '@/permisos/etiquetas';
import { useSesion, useYo } from '@/sesion/SesionProvider';
import { Boton } from '../ui';
import { Sidebar } from './Sidebar';

const CLAVE_COLAPSADA = 'zulu:sidebar-colapsada';

function leerColapsada() {
  try {
    return localStorage.getItem(CLAVE_COLAPSADA) === '1';
  } catch {
    return false;
  }
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/** Estructura del dashboard: barra lateral + barra superior + contenido. */
export function AppShell() {
  const yo = useYo();
  const { condominioActivo, elegirCondominio, salir } = useSesion();
  const [colapsada, setColapsada] = useState(leerColapsada);
  const [menuMovil, setMenuMovil] = useState(false);

  const alternarColapso = () => {
    const nuevo = !colapsada;
    setColapsada(nuevo);
    try {
      localStorage.setItem(CLAVE_COLAPSADA, nuevo ? '1' : '0');
    } catch {
      /* preferencia no persistente */
    }
  };

  const rol = yo.esSuperadmin
    ? 'Superadministrador ZULU'
    : condominioActivo
      ? NOMBRE_ROL[condominioActivo.rol]
      : 'Sin condominio';

  return (
    <div className={`app-shell${colapsada ? ' colapsada' : ''}`}>
      <a href="#contenido" className="saltar-contenido">
        Saltar al contenido
      </a>
      <aside className="sidebar-fija d-none d-lg-block">
        <Sidebar />
      </aside>
      <Offcanvas
        show={menuMovil}
        onHide={() => setMenuMovil(false)}
        className="border-0"
        style={{ width: 280 }}
        aria-label="Menú"
      >
        <Offcanvas.Body className="p-0">
          <Sidebar alNavegar={() => setMenuMovil(false)} />
        </Offcanvas.Body>
      </Offcanvas>

      <div className="d-flex flex-column min-w-0">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-link text-body p-1 d-lg-none"
            aria-label="Abrir menú"
            onClick={() => setMenuMovil(true)}
          >
            <i className="bi bi-list fs-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-link text-body p-1 d-none d-lg-inline-flex"
            aria-label={colapsada ? 'Expandir menú lateral' : 'Contraer menú lateral'}
            aria-pressed={colapsada}
            onClick={alternarColapso}
          >
            <i className="bi bi-layout-sidebar fs-5" aria-hidden="true" />
          </button>

          {yo.condominios.length > 1 ? (
            <label className="d-flex align-items-center gap-2 mb-0">
              <i className="bi bi-buildings text-body-secondary" aria-hidden="true" />
              <span className="visually-hidden">Condominio</span>
              <select
                className="form-select form-select-sm"
                value={condominioActivo?.condominioId ?? ''}
                onChange={(e) => elegirCondominio(e.target.value)}
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
              <span className="d-none d-sm-inline-flex align-items-center gap-2 text-body-secondary">
                <i className="bi bi-buildings" aria-hidden="true" />
                {condominioActivo.razonSocial}
              </span>
            )
          )}

          <div className="ms-auto d-flex align-items-center gap-3">
            <div className="d-none d-md-flex align-items-center gap-2">
              <span className="avatar" aria-hidden="true">
                {iniciales(yo.nombre)}
              </span>
              <div className="lh-sm">
                <p className="mb-0 fw-semibold small">{yo.nombre}</p>
                <p className="mb-0 small text-body-secondary">{rol}</p>
              </div>
            </div>
            <Boton variante="secundario" className="btn-sm" onClick={() => void salir()}>
              <i className="bi bi-box-arrow-right" aria-hidden="true" />
              Salir
            </Boton>
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="contenido">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
