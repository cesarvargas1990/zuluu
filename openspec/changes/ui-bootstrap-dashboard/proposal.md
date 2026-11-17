# Propuesta: Migrar la web a Bootstrap 5 con dashboard de barra lateral

## Intención

ZULU pidió una interfaz de dashboard más "premium" con Bootstrap 5. La web actual (Tailwind) funciona, pero conviene fijar ya el sistema visual antes de construir los módulos de negocio.

## Alcance

### Incluido

- Bootstrap 5.3 + React-Bootstrap 2 + tema Sass con la identidad ZULU; eliminar Tailwind.
- Layout de dashboard: barra lateral colapsable (Offcanvas en móvil), barra superior con condominio y menú de usuario.
- Componentes de dashboard: PageHeader, KpiCard, Semaforo, EstadoVacio.
- Migrar ingreso, MFA, recuperación, inicio y personas sin cambiar su comportamiento.

### Excluido

- Funcionalidades nuevas o cambios del API.

## Capacidades

### Nuevas

- Ninguna.

### Modificadas

- Ninguna: `web-acceso` y `web-membresias` conservan sus requisitos; es un cambio de presentación.

## Enfoque

Seguir la skill `dashboard-bootstrap`. Mantener la API de los componentes base (`Boton`, `Campo`, `Selector`, `Alerta`, `Etiqueta`, `Tarjeta`, `DialogoConfirmacion`) para que las páginas y las pruebas cambien lo mínimo.

## Riesgos

| Riesgo                                        | Prob. | Mitigación                                                |
| --------------------------------------------- | ----- | --------------------------------------------------------- |
| Regresiones de comportamiento                 | Media | Pruebas de componentes (34) y E2E (5) deben seguir verdes |
| Modales en portal rompen consultas de pruebas | Media | Consultar por `screen`                                    |

## Rollback

Revertir el commit; no hay cambios de datos ni de API.

## Criterios de éxito

- [ ] Sin Tailwind en el proyecto.
- [ ] Pruebas de componentes y E2E en verde.
- [ ] Revisión visual a 375, 768 y 1440 px sin scroll horizontal de página.
