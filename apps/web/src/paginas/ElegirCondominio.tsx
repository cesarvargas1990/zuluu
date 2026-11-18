import type { Rol } from '@zulu/shared';
import { useNavigate } from 'react-router';
import { MarcoAcceso } from '@/componentes/layout/MarcoAcceso';
import { Boton } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { NOMBRE_ROL } from '@/permisos/etiquetas';
import { useSesion } from '@/sesion/SesionProvider';

const SIN_GRUPO = 'Sin condominio asignado';

interface Copropiedad {
  id: string;
  razonSocial: string;
  roles: Rol[];
}

/** Tras iniciar sesión: copropiedades con las que la persona puede trabajar, agrupadas por condominio. */
export function ElegirCondominio() {
  useTitulo('Elegir copropiedad');
  const navegar = useNavigate();
  const { estado, confirmarCondominio, salir } = useSesion();
  if (estado.tipo !== 'activa') return null;
  const { yo } = estado;

  // condominio → copropiedades (cada una una sola vez, con todos sus roles)
  const porGrupo = new Map<string, Map<string, Copropiedad>>();
  for (const c of yo.condominios) {
    const nombreGrupo = c.grupoNombre ?? SIN_GRUPO;
    const copropiedades = porGrupo.get(nombreGrupo) ?? new Map<string, Copropiedad>();
    const cop = copropiedades.get(c.condominioId) ?? {
      id: c.condominioId,
      razonSocial: c.razonSocial,
      roles: [],
    };
    cop.roles.push(c.rol);
    copropiedades.set(c.condominioId, cop);
    porGrupo.set(nombreGrupo, copropiedades);
  }
  const grupos = [...porGrupo.entries()].sort(([a], [b]) =>
    a === SIN_GRUPO ? 1 : b === SIN_GRUPO ? -1 : a.localeCompare(b, 'es'),
  );

  const elegir = (id: string) => {
    confirmarCondominio(id);
    void navegar('/', { replace: true });
  };

  return (
    <MarcoAcceso titulo="¿Con qué copropiedad va a trabajar?">
      <p className="text-body-secondary">
        Hola, {yo.nombre}. Elija una copropiedad para continuar; puede cambiarla después desde el
        encabezado.
      </p>
      {grupos.length === 0 ? (
        <p role="status">
          No tiene copropiedades asignadas.
          {yo.esSuperadmin && ' Como superadministrador puede crearlas desde la consola.'}
        </p>
      ) : (
        grupos.map(([nombreGrupo, copropiedades]) => (
          <div key={nombreGrupo} role="group" aria-label={nombreGrupo} className="mb-3">
            <h2 className="h6 text-body-secondary text-uppercase small mb-2">
              <i className="bi bi-diagram-3 me-1" aria-hidden="true" />
              {nombreGrupo}
            </h2>
            <div className="list-group">
              {[...copropiedades.values()]
                .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'))
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="list-group-item list-group-item-action d-flex align-items-center gap-3"
                    onClick={() => elegir(c.id)}
                  >
                    <i className="bi bi-buildings fs-4" aria-hidden="true" />
                    <span className="flex-grow-1 text-start">
                      <span className="d-block fw-semibold">{c.razonSocial}</span>
                      <span className="d-block small opacity-75">
                        {c.roles.map((r) => NOMBRE_ROL[r]).join(' · ')}
                      </span>
                    </span>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                  </button>
                ))}
            </div>
          </div>
        ))
      )}
      {yo.esSuperadmin && grupos.length === 0 && (
        <Boton className="me-2" onClick={() => void navegar('/', { replace: true })}>
          Continuar
        </Boton>
      )}
      <Boton variante="secundario" onClick={() => void salir()}>
        Salir
      </Boton>
    </MarcoAcceso>
  );
}
