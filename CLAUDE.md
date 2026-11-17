# ZULU ADMIN · Majagua Digital

Plataforma web para administrar condominios (expedientes, cartera, finanzas, jurídico, PQRS, mantenimiento, ambiental/agua, informes). Cliente: ZULU Servicios Integrales S.A.S.; piloto: Majagua Villa Campestre. Requisitos: `docs/requirements/especificaciones.md` (PDF original al lado).

## Stack

- Monorepo **pnpm** (Node ≥ 22). `apps/api` NestJS 11 + Prisma 6 + PostgreSQL 17 · `apps/web` React + Vite + TS · `packages/shared` tipos y constantes de dominio (roles, áreas, estados).
- **UI: Bootstrap 5.3 + React-Bootstrap + tema Sass ZULU, dashboard con barra lateral** (decisión 2026-11-09; migración completada). Seguir la skill `dashboard-bootstrap`.
- Infra local en `docker-compose.yml`: Postgres (**puerto 5433**), MinIO (S3, 9000/9001), Mailpit (SMTP 1025, bandeja http://localhost:8025).
- Identidad visual ZULU: verde bosque `#0b2e1a` + techo lima `#8cc63f` / naranja `#f08a24` (variables en `apps/web/src/estilos/_variables.scss`; lima/naranja solo decorativos). Logo vectorial provisional en `apps/web/src/componentes/Logo.tsx`.
- Pruebas: Vitest (unit en `src/**/*.spec.ts`, integración en `apps/api/test/*.int.spec.ts` contra Postgres real).

## Comandos

```bash
cp .env.example .env && pnpm install
pnpm db:up && pnpm db:migrate
docker compose exec -T postgres psql -U zulu -d zulu_admin < scripts/dev-db-roles.sql   # solo la 1ª vez
pnpm db:seed                  # datos ficticios: *@demo.test / superadmin@zulu.test, clave SEED_PASSWORD
pnpm dev                      # api :3000 (/api/v1) + web :5173 (proxy /api)
# si `pnpm dev` falla con ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT: pnpm --parallel --filter @zulu/api --filter @zulu/web dev
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @zulu/api test:integration
docker compose up -d mailpit && pnpm test:e2e   # Playwright contra API + web en marcha (reinicia datos demo)
```

## Reglas no negociables

- **Multi-tenant con RLS**: todo dato de condominio tiene `condominio_id` + política RLS; el runtime usa el rol `zulu_app` y `prisma.withTenant()`. Ver skill `prisma-tenant-table`.
- **Auditoría append-only**, originales inmutables con SHA-256, dinero en `Decimal` y nunca se borra (reversos). Ver skill `zulu-domain`.
- Dominio, UI y mensajes en **español**; datos de prueba siempre ficticios (nunca datos reales de propietarios).
- Secretos solo en `.env` (ignorado); nunca en código ni migraciones.

## Autenticación y permisos (ya implementado)

- Guards globales en orden: Throttler → `JwtGuard` → `MfaGuard` → `CondominioGuard` → `PermisoGuard`. **Todo endpoint exige sesión** salvo `@Publico()`.
- Endpoints de negocio: `@RequierePermiso('<área>', '<acción>')` + header `X-Condominio-Id`; el servicio lee `contexto.actual().condominioId` y usa `prisma.withTenant`.
- Matriz rol→permisos en `packages/shared/src/permisos.ts` (borrador, validar con ZULU). Superadmin = `usuario.es_superadmin`; datos solo con acceso excepcional (lectura).
- Auditoría: `AuditoriaService.registrar(tx, evento)` dentro de la misma transacción; nunca incluir secretos.

## Consola de superadmin (ya implementado)

- API `/api/v1/admin/*` (`apps/api/src/admin/`): `SuperadminGuard` + MFA. Lecturas entre condominios solo con `prisma.comoSuperadmin()` (funciones `app_condominios()` / `app_membresias_todas()` que exigen `app.superadmin`); escrituras por condominio con `withTenant`.
- Crear usuario ⇒ invitación por correo (`correos.ts`, enlace 72 h). Web: `/admin/usuarios`, `/admin/condominios`.

## Finanzas: recaudos y cartera (REQ-003 y REQ-004, ya implementado)

- **Recaudos** (`apps/api/src/recaudos/`, web `/recaudos`): registro de pagos con soporte, duplicados, verificación con imputación, anulación con motivo e importación desde Excel. Estado y supuestos: `openspec/changes/req003-pagos-recaudos/`.
- **Cartera** (`apps/api/src/cartera/`, web `/cartera`): obligaciones, libro de movimientos (solo inserción), antigüedad por fecha de corte, gestiones, compromisos, ajustes con aprobación de otra persona, importación de saldos iniciales y reportes Excel/PDF. Estado y supuestos: `docs/requerimientos/REQ-004-estado-implementacion.md`.
- El saldo nunca se guarda: se calcula con `calcularSaldo` (`cartera.reglas.ts`). Solo un recaudo **verificado** crea movimiento `PAGO`; anularlo crea `REVERSO_PAGO`.
- Dinero desde texto o Excel: siempre `parsearValor` (`recaudos.reglas.ts`), que entiende el formato colombiano ("580.000"). Fechas "de hoy": `hoyEnBogota()`, nunca `new Date()` (de noche UTC ya es el día siguiente).
- Permisos del área 02: `leer` consulta · `crear` pagos, gestiones y compromisos · `editar` obligaciones y solicitud de ajustes · `aprobar` verificar/anular pagos, resolver ajustes, aprobar importaciones · `exportar` reportes.
- El API usa `packages/shared` compilado: tras cambiar la matriz de permisos, `pnpm --filter @zulu/shared build` y reiniciar el API.

## Producción

- https://cesarvargas.tech/zulu · servidor `cvargas@147.93.1.252`, carpeta `~/zuluu` (código sincronizado con rsync, sin git) · compose `docker-compose.production.yml` (servicios `db`, `migrate`, `api`, `web`; nginx del host → `127.0.0.1:8301`).
- Secretos solo en `~/zuluu/.env` del servidor (`ZULU_*`, ver `deploy/env.production.example`; SMTP Gmail con clave de aplicación).
- Desplegar: respaldo `pg_dump` en `~/backups/zulu/` → `rsync` de `apps` y `packages` (excluir node_modules, dist, .env, `._*`) y archivos raíz → `docker compose -f docker-compose.production.yml build && up -d` (migrate aplica migraciones) → verificar `/zulu/api/v1/health`.

## Web (`apps/web`)

- React 19 + React Router 7 + TanStack Query. Estilos: Bootstrap 5 + React-Bootstrap con tema Sass en `src/estilos/` (skill `dashboard-bootstrap`). Layout en `src/componentes/layout/` (AppShell, Sidebar, menú en `navegacion.ts`). Rutas en `src/rutas.tsx`; sesión en `src/sesion/` (token solo en memoria, renovación con cookie y Web Locks).
- Llamar al API siempre con `api()` de `src/api/cliente.ts` (agrega token y `X-Condominio-Id`, renueva ante 401). Endpoints donde 401 es una respuesta válida usan `renovarEn401: false`.
- Componentes base en `src/componentes/ui.tsx` sobre React-Bootstrap (`Campo`, `Boton`, `Alerta`, `Etiqueta`, `Tarjeta`) + `DialogoConfirmacion` (Modal) + `dashboard/` (`PageHeader`, `KpiCard`, `Semaforo`, `EstadoVacio`). Estados siempre con texto, no solo color.
- Áreas en orden: usar `AREA_CODIGOS` de `@zulu/shared`, nunca `Object.keys(AREAS)`.

## Flujo de trabajo: Spec-Driven Development

Cambios no triviales siguen SDD con persistencia **openspec** (`openspec/`):
`/sdd-explore` → `/sdd-propose` → `/sdd-spec` → `/sdd-design` → `/sdd-tasks` → `/sdd-apply` → `/sdd-verify` → `/sdd-archive`.
strict-tdd-mode: enabled

## Skills del proyecto (`.claude/skills/`)

- `zulu-domain` — invariantes de negocio, roles, glosario, pruebas de aceptación.
- `nest-module` — estructura y reglas para módulos del API.
- `prisma-tenant-table` — tablas, migraciones y RLS.
- `dashboard-bootstrap` — UI premium con Bootstrap 5 / React-Bootstrap: tema ZULU, layout con barra lateral, KPIs, semáforos, formularios, migración desde Tailwind.

Skills de usuario útiles: `sdd-*` (flujo), `dataviz` (gráficos y KPIs), `ui-ux-pro-max` / `better-accessibility` / `better-writing` (UI en español, accesible), `playwright-cli` (E2E), `security-review` / `code-review` (antes de PR).
