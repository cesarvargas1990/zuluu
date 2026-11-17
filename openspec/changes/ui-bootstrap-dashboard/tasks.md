# Tareas: Migrar la web a Bootstrap 5

## Fase 1: Base

- [x] 1.1 Instalar bootstrap, react-bootstrap, bootstrap-icons, recharts, sass; quitar tailwindcss y @tailwindcss/vite
- [x] 1.2 `src/estilos/` (_variables, _componentes, main.scss) con la identidad ZULU; importar en main.tsx

## Fase 2: Componentes

- [x] 2.1 `ui.tsx` sobre React-Bootstrap conservando props
- [x] 2.2 `DialogoConfirmacion` sobre `Modal`
- [x] 2.3 `AppShell` (Sidebar + Topbar + Offcanvas móvil) y `MarcoAcceso`
- [x] 2.4 `PageHeader`, `KpiCard`, `Semaforo`, `EstadoVacio`

## Fase 3: Pantallas

- [x] 3.1 Ingresar, Mfa, MfaConfigurar, Olvide, Restablecer, NoEncontrado
- [x] 3.2 Inicio como dashboard (KPIs reales: rol, áreas con acceso, acciones de aprobación; tabla de permisos)
- [x] 3.3 Personas y permisos

## Fase 4: Verificación

- [x] 4.1 Pruebas de componentes y E2E en verde
- [x] 4.2 Revisión visual 375/768/1440 px; actualizar CLAUDE.md (Tailwind eliminado)
