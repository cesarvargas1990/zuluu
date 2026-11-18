import { ACCIONES, AREA_CODIGOS, AREAS, permisosPorDefecto } from '@zulu/shared';
import Badge from 'react-bootstrap/Badge';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';
import { Link } from 'react-router';
import { EstadoVacio } from '@/componentes/dashboard/EstadoVacio';
import { KpiCard } from '@/componentes/dashboard/KpiCard';
import { PageHeader } from '@/componentes/dashboard/PageHeader';
import { useTitulo } from '@/componentes/useTitulo';
import { NOMBRE_ACCION, NOMBRE_ROL } from '@/permisos/etiquetas';
import { useSesion, useYo } from '@/sesion/SesionProvider';

export function Inicio() {
  useTitulo('Inicio');
  const yo = useYo();
  const { condominioActivo } = useSesion();
  const primerNombre = yo.nombre.split(' ')[0];

  if (!condominioActivo) {
    return (
      <>
        <PageHeader titulo={`Hola, ${primerNombre}`} />
        <Card>
          {yo.esSuperadmin ? (
            <EstadoVacio
              icono="bi-person-gear"
              titulo="Consola de administración ZULU"
              accion={
                <div className="d-flex flex-wrap justify-content-center gap-2">
                  <Link to="/admin/usuarios" className="btn btn-primary">
                    <i className="bi bi-person-gear me-2" aria-hidden="true" />
                    Usuarios
                  </Link>
                  <Link to="/admin/condominios" className="btn btn-outline-secondary">
                    <i className="bi bi-buildings me-2" aria-hidden="true" />
                    Condominios
                  </Link>
                </div>
              }
            >
              Como superadministrador puede crear condominios, copropiedades y usuarios, y asignar
              sus roles.
            </EstadoVacio>
          ) : (
            <EstadoVacio icono="bi-buildings" titulo="No tiene copropiedades asignadas">
              Pida al administrador de su condominio que le asigne un rol.
            </EstadoVacio>
          )}
        </Card>
      </>
    );
  }

  const porArea = AREA_CODIGOS.map((area) => ({
    area,
    acciones: permisosPorDefecto(condominioActivo.rol, area),
  }));
  const conAcceso = porArea.filter((a) => a.acciones.length > 0).length;
  const aprueba = porArea.filter((a) => a.acciones.includes('aprobar')).length;

  return (
    <>
      <PageHeader
        titulo={`Hola, ${primerNombre}`}
        descripcion={
          <>
            Está trabajando en <strong className="text-body">{condominioActivo.razonSocial}</strong>{' '}
            como <strong className="text-body">{NOMBRE_ROL[condominioActivo.rol]}</strong>.
          </>
        }
      />

      <Row xs={1} sm={2} xl={4} className="g-3 mb-4">
        <Col>
          <KpiCard
            etiqueta={condominioActivo.grupoNombre ? condominioActivo.grupoNombre : 'Copropiedad'}
            valor={<span className="fs-5">{condominioActivo.razonSocial}</span>}
            icono="bi-buildings"
          />
        </Col>
        <Col>
          <KpiCard
            etiqueta="Su rol"
            valor={<span className="fs-5">{NOMBRE_ROL[condominioActivo.rol]}</span>}
            icono="bi-person-badge"
          />
        </Col>
        <Col>
          <KpiCard
            etiqueta="Áreas con acceso"
            valor={`${conAcceso} de ${AREA_CODIGOS.length}`}
            icono="bi-folder2-open"
          />
        </Col>
        <Col>
          <KpiCard
            etiqueta="Áreas donde aprueba"
            valor={aprueba}
            icono="bi-patch-check"
            detalle={aprueba === 0 ? 'Su rol no aprueba operaciones' : undefined}
          />
        </Col>
      </Row>

      <Card>
        <Card.Header className="pt-4 pb-0 border-0">
          <h2 className="h5 mb-1">Lo que puede hacer según su rol</h2>
          <p className="small text-body-secondary mb-0">
            El administrador puede concederle o restringirle permisos adicionales.
          </p>
        </Card.Header>
        <Card.Body>
          <Table responsive hover className="align-middle mb-0">
            <caption className="visually-hidden">Permisos por área según su rol</caption>
            <thead className="table-light">
              <tr>
                <th scope="col">Área</th>
                <th scope="col">Acciones permitidas</th>
              </tr>
            </thead>
            <tbody>
              {porArea.map(({ area, acciones }) => (
                <tr key={area}>
                  <th scope="row" className="fw-normal">
                    <span className="tabular text-body-secondary">{area}</span> {AREAS[area]}
                  </th>
                  <td>
                    {acciones.length === 0 ? (
                      <span className="text-body-secondary">
                        <i className="bi bi-dash-circle me-1" aria-hidden="true" />
                        Sin acceso
                      </span>
                    ) : (
                      <div className="d-flex flex-wrap gap-1">
                        {ACCIONES.filter((a) => acciones.includes(a)).map((a) => (
                          <Badge key={a} bg="" className="bg-primary-subtle text-primary-emphasis">
                            {NOMBRE_ACCION[a]}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </>
  );
}
