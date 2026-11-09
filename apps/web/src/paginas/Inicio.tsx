import { ACCIONES, AREA_CODIGOS, AREAS, permisosPorDefecto } from '@zulu/shared';
import { Tarjeta } from '@/componentes/ui';
import { useTitulo } from '@/componentes/useTitulo';
import { NOMBRE_ACCION, NOMBRE_ROL } from '@/permisos/etiquetas';
import { useSesion, useYo } from '@/sesion/SesionProvider';

export function Inicio() {
  useTitulo('Inicio');
  const yo = useYo();
  const { condominioActivo } = useSesion();
  const primerNombre = yo.nombre.split(' ')[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Hola, {primerNombre}</h1>
        {condominioActivo && (
          <p className="mt-1 text-texto-suave">
            Está trabajando en{' '}
            <strong className="text-texto">{condominioActivo.razonSocial}</strong> como{' '}
            <strong className="text-texto">{NOMBRE_ROL[condominioActivo.rol]}</strong>.
          </p>
        )}
      </div>

      {!condominioActivo ? (
        <Tarjeta>
          <h2 className="text-lg font-semibold">No tiene condominios asignados</h2>
          <p className="mt-2 text-texto-suave">
            {yo.esSuperadmin
              ? 'Como superadministrador, la gestión de condominios y los accesos excepcionales estarán en la consola de superadmin.'
              : 'Pida a la administradora de su condominio que le asigne un rol.'}
          </p>
        </Tarjeta>
      ) : (
        <Tarjeta>
          <h2 className="text-lg font-semibold">Lo que puede hacer según su rol</h2>
          <p className="mt-1 text-sm text-texto-suave">
            La administradora puede concederle o restringirle permisos adicionales.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <caption className="sr-only">Permisos por área según su rol</caption>
              <thead>
                <tr className="border-b border-borde">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Área
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Acciones permitidas
                  </th>
                </tr>
              </thead>
              <tbody>
                {AREA_CODIGOS.map((area) => {
                  const acciones = permisosPorDefecto(condominioActivo.rol, area);
                  return (
                    <tr key={area} className="border-b border-borde/60 last:border-0">
                      <th scope="row" className="py-2 pr-4 font-normal">
                        <span className="text-texto-suave tabular-nums">{area}</span> {AREAS[area]}
                      </th>
                      <td className="py-2">
                        {acciones.length === 0 ? (
                          <span className="text-texto-suave">Sin acceso</span>
                        ) : (
                          ACCIONES.filter((a) => acciones.includes(a))
                            .map((a) => NOMBRE_ACCION[a])
                            .join(', ')
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
