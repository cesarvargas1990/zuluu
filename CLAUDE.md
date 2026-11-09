# ZULU ADMIN · Majagua Digital

Plataforma web para administrar condominios (expedientes, cartera, finanzas, jurídico, PQRS, mantenimiento, ambiental/agua, informes). Cliente: ZULU Servicios Integrales S.A.S.; piloto: Majagua Villa Campestre. Requisitos: `docs/requirements/especificaciones.md` (PDF original al lado).

## Stack

- Monorepo **pnpm** (Node ≥ 22). `apps/api` NestJS 11 + Prisma 6 + PostgreSQL 17 · `apps/web` React + Vite + TS · `packages/shared` tipos y constantes de dominio (roles, áreas, estados).
- Infra local en `docker-compose.yml`: Postgres (**puerto 5433**), MinIO (S3, 9000/9001), Mailpit (8025).
- Pruebas: Vitest (unit en `src/**/*.spec.ts`, integración en `apps/api/test/*.int.spec.ts` contra Postgres real).

## Comandos

```bash
cp .env.example .env && pnpm install
pnpm db:up && pnpm db:migrate
docker compose exec -T postgres psql -U zulu -d zulu_admin < scripts/dev-db-roles.sql   # solo la 1ª vez
pnpm db:seed                  # datos ficticios: *@demo.test / superadmin@zulu.test, clave SEED_PASSWORD
pnpm dev                      # api :3000 (/api/v1) + web :5173 (proxy /api)
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @zulu/api test:integration
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

## Flujo de trabajo: Spec-Driven Development

Cambios no triviales siguen SDD con persistencia **openspec** (`openspec/`):
`/sdd-explore` → `/sdd-propose` → `/sdd-spec` → `/sdd-design` → `/sdd-tasks` → `/sdd-apply` → `/sdd-verify` → `/sdd-archive`.
strict-tdd-mode: enabled

## Skills del proyecto (`.claude/skills/`)

- `zulu-domain` — invariantes de negocio, roles, glosario, pruebas de aceptación.
- `nest-module` — estructura y reglas para módulos del API.
- `prisma-tenant-table` — tablas, migraciones y RLS.

Skills de usuario útiles: `sdd-*` (flujo), `ui-ux-pro-max` / `better-accessibility` / `better-writing` (UI en español, accesible), `playwright-cli` (E2E), `security-review` / `code-review` (antes de PR).
