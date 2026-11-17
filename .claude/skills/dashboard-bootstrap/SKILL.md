---
name: dashboard-bootstrap
description: Diseño y construcción de la interfaz web de ZULU ADMIN como dashboard premium con Bootstrap 5, React-Bootstrap y tema Sass con la identidad ZULU (barra lateral, tarjetas KPI, semáforos, tablas, formularios, modales). Usar al crear o modificar cualquier pantalla, componente o estilo en apps/web, al migrar pantallas desde Tailwind o al agregar gráficos e indicadores.
---

# Dashboard premium con Bootstrap 5 (apps/web)

Decisiones fijadas con el usuario (2026-11-09):

- **Bootstrap 5.3 + React-Bootstrap 2 + tema Sass propio.** Tailwind se elimina: no mezclar sistemas de estilos.
- **Estilo**: barra lateral verde ZULU colapsable + barra superior + tarjetas de indicadores (KPI), semáforos y gráficos.
- Sin jQuery ni `bootstrap.bundle.js`: todo lo interactivo (Modal, Offcanvas, Dropdown, Tooltip, Toast) con componentes de React-Bootstrap.

## Dependencias

```bash
pnpm --filter @zulu/web add bootstrap@5.3 react-bootstrap@2 bootstrap-icons@1 recharts@3
pnpm --filter @zulu/web add -D sass
```

Gráficos: Recharts. Antes de diseñar cualquier gráfico o KPI, cargar la skill `dataviz`.

## Tema Sass (identidad ZULU)

```
src/estilos/
  _variables.scss   ← overrides de Bootstrap (ANTES de importar bootstrap)
  _componentes.scss ← estilos propios: sidebar, kpi, semáforo, tablas
  main.scss         ← punto de entrada, importado en main.tsx
```

`_variables.scss` (fuente única de color; no usar hex sueltos en componentes):

```scss
// Identidad ZULU: verde bosque + techo lima/naranja (lima y naranja SOLO decorativos: no pasan contraste como texto)
$zulu-bosque: #0b2e1a;
$zulu-verde: #14522f;
$zulu-lima: #8cc63f;
$zulu-naranja: #f08a24;

$primary: $zulu-verde;
$dark: $zulu-bosque;
$success: #1d6b34;
$warning: #b26a00; // texto oscuro encima (ver semáforo)
$danger: #a3261c;
$info: #1f5f8b;
$body-bg: #f4f6f4;
$body-color: #142019;
$secondary-color: #4f5e55;
$border-color: #dfe5e1;

$font-family-sans-serif:
  system-ui,
  -apple-system,
  'Segoe UI',
  Roboto,
  'Helvetica Neue',
  Arial,
  sans-serif;
$headings-font-weight: 600;
$border-radius: 0.5rem;
$border-radius-lg: 0.75rem;
$card-border-width: 0;
$card-box-shadow:
  0 1px 2px rgba(11, 46, 26, 0.06),
  0 4px 16px rgba(11, 46, 26, 0.06);
$enable-shadows: true;
$focus-ring-color: rgba($zulu-verde, 0.35);
$focus-ring-width: 0.2rem;
$btn-padding-y: 0.55rem; // objetivo táctil ≥ 44 px
$input-padding-y: 0.55rem;
$table-cell-padding-y: 0.75rem;
```

`main.scss`:

```scss
@import 'variables';
@import 'bootstrap/scss/bootstrap';
@import 'bootstrap-icons/font/bootstrap-icons.css';
@import 'componentes';
```

(Si Sass advierte por `@import`, silenciar `deprecation` de dependencias en `vite.config.ts` → `css.preprocessorOptions.scss.quietDeps: true`.)

## Estructura del dashboard

```
src/componentes/layout/
  AppShell.tsx    ← Sidebar + Topbar + <main id="contenido">
  Sidebar.tsx     ← fija en ≥ lg (260 px, colapsable a 76 px solo íconos); Offcanvas en < lg
  Topbar.tsx      ← botón menú (móvil), título de página, selector de condominio, usuario (Dropdown: perfil, salir)
src/componentes/dashboard/
  PageHeader.tsx  ← título h1 + descripción + acciones a la derecha
  KpiCard.tsx     ← valor grande (tabular-nums), etiqueta, variación, ícono, enlace "ver detalle"
  Semaforo.tsx    ← Badge con TEXTO + ícono (nunca solo color)
  EstadoVacio.tsx ← ícono, mensaje útil y acción principal
  Esqueleto.tsx   ← placeholders (`placeholder-glow`) mientras carga
  ConfirmarModal.tsx
```

Reglas del layout:

- Sidebar: fondo `$dark`, texto blanco 85 %, ítem activo con fondo `rgba(white,.12)` y **barra izquierda lima de 3 px**; franja lima/naranja de 4 px bajo el logo. Agrupar ítems por sección (Operación, Finanzas, Jurídico, Configuración) con encabezados pequeños en mayúsculas.
- Ítems del menú según rol: ocultar lo que la matriz de permisos niega (`permisosPorDefecto` de `@zulu/shared`); el API igual valida.
- Enlace "Saltar al contenido" primero en el DOM. `NavLink` con `aria-current="page"`.
- Contenido: `container-fluid` con `px-4 py-4`, ancho máx. 1440 px; grilla de KPIs `row g-3` con `col-12 col-sm-6 col-xl-3`.

## Semáforo (§7 de la especificación)

| Estado                                                                                                            | Clase                                           | Texto obligatorio     | Ícono                     |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------- | ------------------------- |
| Urgente                                                                                                           | `text-bg-danger`                                | "Urgente"             | `bi-exclamation-octagon`  |
| Riesgo                                                                                                            | `bg-naranja-suave text-naranja-oscuro` (propio) | "En riesgo"           | `bi-exclamation-triangle` |
| En trámite                                                                                                        | `text-bg-warning`                               | "En trámite"          | `bi-hourglass-split`      |
| Cerrado                                                                                                           | `text-bg-success`                               | "Cerrado con soporte" | `bi-check-circle`         |
| Colores configurables por condominio en el futuro: leerlos de variables CSS (`--zulu-semaforo-*`), no hardcodear. |

## Calidad "premium" (checklist antes de terminar una pantalla)

- Jerarquía clara: un solo h1 por página (PageHeader), h2 por tarjeta; máx. 3 pesos tipográficos.
- Números con `font-variant-numeric: tabular-nums`; dinero en COP con `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`; fechas con `Intl.DateTimeFormat('es-CO')`.
- Tarjetas sin borde con sombra suave (`card shadow-sm`), radios consistentes, espaciado en múltiplos de `.25rem`.
- Estados completos: cargando (esqueleto, no spinner a pantalla completa), vacío (EstadoVacio con acción), error (Alert con reintento), éxito (Toast breve o Alert `role="status"`).
- Tablas: `table table-hover align-middle` dentro de `card` con `table-responsive`; encabezado `table-light` pegajoso; acciones a la derecha con `btn-sm btn-outline-*` o Dropdown "⋯" con `aria-label`.
- Íconos de Bootstrap Icons a 1–1.25 rem, siempre con texto o `aria-label`; decorativos con `aria-hidden="true"`.
- Nada de azul por defecto de Bootstrap: todo pasa por `$primary`.
- Hover/focus visibles en todo lo clicable; transiciones ≤ 150 ms; respetar `prefers-reduced-motion`.
- Probar a 375 px, 768 px y 1440 px: sin scroll horizontal de página (solo dentro de `table-responsive`).

## Formularios y errores del API

```tsx
<Form.Group controlId="email" className="mb-3">
  <Form.Label>Email</Form.Label>
  <Form.Control type="email" value={email} onChange={…} isInvalid={!!error?.deCampo('email')} />
  <Form.Control.Feedback type="invalid">{error?.deCampo('email')}</Form.Control.Feedback>
</Form.Group>
```

- Errores generales con `<Alert variant="danger" role="alert">`; avisos con `role="status"`.
- Botón de envío con `disabled` + `<Spinner size="sm" aria-hidden />` y texto ("Guardando…").
- Llamar siempre al API con `api()` de `src/api/cliente.ts` y TanStack Query (ver CLAUDE.md).

## Modales y confirmaciones

`<Modal show onHide centered aria-labelledby>` de React-Bootstrap (maneja foco, Escape y retorno de foco). Las confirmaciones destructivas nombran el objeto ("Desactivar a Andrés Asistente") y el botón dice la acción ("Sí, desactivar"), variante `danger`.

## Pruebas

- Testing Library sigue igual: consultar por rol y nombre accesible. Los Modal/Offcanvas se renderizan en portal: usar `screen`, no `within(contenedor)`.
- En jsdom, React-Bootstrap usa transiciones: pasar `animation={false}` vía prop en pruebas o esperar con `findBy*`.
- Mantener verdes `pnpm --filter @zulu/web test` y `pnpm test:e2e` (Playwright) tras cada pantalla.

## Lecciones de la implementación

- `Object.keys(AREAS)` pone "10" primero: usar `AREA_CODIGOS`.
- En celdas con código + nombre (`<span>04</span> Jurídica`), dejar un espacio real (`{' '}`): sin él el nombre accesible queda "04Jurídica".
- `.table-responsive` puede desbordar 1 px en vertical y Chrome dibuja una barra: ya se fija `overflow-y: hidden` en `_componentes.scss`.
- Columnas de grid/flex que contienen tablas o textos largos: clase `min-w-0` (propia).
- Pruebas: `src/test/setup.ts` simula `matchMedia` (lo usa Offcanvas); `DialogoConfirmacion` desactiva animaciones cuando `import.meta.env.MODE === 'test'`.
- Logo SVG: colores con `var(--zulu-lima)` / `var(--zulu-naranja)` (definidas en `:root`).

## Migración desde Tailwind (completada 2026-11-09; referencia)

1. Instalar dependencias y crear `src/estilos/`; importar `main.scss` en `main.tsx`; quitar `@tailwindcss/vite` de `vite.config.ts`, `tailwindcss` de package.json y `@import 'tailwindcss'` de `index.css`.
2. Reemplazar `src/componentes/ui.tsx` por envoltorios finos sobre React-Bootstrap conservando las mismas props (`Boton`, `Campo`, `Selector`, `Alerta`, `Etiqueta`, `Tarjeta`) para no tocar cada página a la vez.
3. `DialogoConfirmacion` → `Modal` de React-Bootstrap.
4. `Layout` → `AppShell` con Sidebar/Topbar; `MarcoAcceso` → tarjeta centrada sobre fondo `$dark` con el logo.
5. Cambiar clases utilitarias de Tailwind por utilidades de Bootstrap (`d-flex gap-3`, `text-body-secondary`, `fw-semibold`…). Buscar restos: `grep -rnE 'className="[^"]*(text-texto|bg-fondo|min-h-11|rounded-md)' src`.
6. Correr pruebas de componentes y E2E; revisar en el navegador a 375/768/1440 px.
