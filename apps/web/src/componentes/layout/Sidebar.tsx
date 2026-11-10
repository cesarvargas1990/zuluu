import { NavLink } from 'react-router';
import { useSesion, useYo } from '@/sesion/SesionProvider';
import { Logo } from '../Logo';
import { menuPara } from './navegacion';

/** Contenido de la barra lateral (se usa fijo en escritorio y dentro del Offcanvas en móvil). */
export function Sidebar({ alNavegar }: { alNavegar?: () => void }) {
  const { condominioActivo } = useSesion();
  const yo = useYo();
  return (
    <div className="sidebar h-100">
      <div className="sidebar-marca">
        <Logo className="w-100" conSubtitulo={false} style={{ maxWidth: '7.5rem' }} />
      </div>
      <div className="franja-marca" aria-hidden="true">
        <span />
        <span />
      </div>
      <nav aria-label="Principal" className="py-2">
        {menuPara(condominioActivo?.rol, yo.esSuperadmin).map((seccion) => (
          <div key={seccion.titulo}>
            <p className="sidebar-seccion mb-0" aria-hidden="true">
              {seccion.titulo}
            </p>
            {seccion.items.map((item) => (
              <NavLink
                key={item.ruta}
                to={item.ruta}
                end={item.ruta === '/'}
                className="sidebar-enlace"
                onClick={alNavegar}
                title={item.texto}
              >
                <i className={`bi ${item.icono}`} aria-hidden="true" />
                <span className="sidebar-texto">{item.texto}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <p className="sidebar-pie mb-0">ZULU ADMIN · Majagua Digital</p>
    </div>
  );
}
