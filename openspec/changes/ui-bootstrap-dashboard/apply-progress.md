# Progreso: ui-bootstrap-dashboard

**Estado**: 11/11 tareas · web 34 pruebas, E2E 5, API 26+48 (2026-11-09)

Cambio de presentación sin cambios de comportamiento: las pruebas existentes (componentes y E2E) actuaron como red de seguridad; no se escribieron pruebas nuevas de lógica.

## Hallazgos durante la migración

- jsdom no tiene `matchMedia` (Offcanvas): simulado en `src/test/setup.ts`.
- Nombre accesible de filas "04Jurídica…" sin espacio: corregido (afectaba lectores de pantalla).
- Logo con variables CSS de Tailwind ya inexistentes (techo oscuro): ahora `--zulu-lima/--zulu-naranja`.
- Barra vertical espuria en `.table-responsive` por desborde de 1 px: `overflow-y: hidden`.

## Revisión visual

1440 px (barra lateral fija), 768 px y 375 px (menú en Offcanvas): sin desborde horizontal de página.

## Pendiente

- En móvil la barra superior oculta nombre de condominio y usuario (se ven en Inicio); evaluar mostrarlos dentro del Offcanvas.
