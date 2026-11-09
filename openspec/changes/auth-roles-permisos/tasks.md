# Tareas: Autenticación, roles y permisos (MVP)

Strict TDD: cada bloque arranca con la prueba en rojo (RED) antes del código (GREEN).

## Fase 1: Fundación

- [x] 1.1 `packages/shared`: compilar a `dist` (CJS + tipos) y enlazar `@zulu/shared` en `apps/api`
- [x] 1.2 RED `packages/shared/src/permisos.spec.ts`: matriz por rol del diseño; CONSEJO vacío; `ROLES_CON_MFA`
- [x] 1.3 GREEN `packages/shared/src/permisos.ts` + quitar `SUPERADMIN_ZULU` de `roles.ts`
- [x] 1.4 `schema.prisma`: campos nuevos en `usuario`; tablas `codigo_respaldo`, `sesion`, `token_recuperacion`, `permiso`, `acceso_excepcional`; quitar `SUPERADMIN_ZULU` del enum
- [x] 1.5 Migración `auth_permisos` con grants `zulu_app` (sin DELETE) y RLS en `permiso` y `acceso_excepcional`
- [x] 1.6 `.env.example`: `MFA_ENC_KEY`, `WEB_ORIGIN`, `JWT_REFRESH_TTL`; validación de env con Zod al arrancar
- [x] 1.7 `apps/api/prisma/seed.ts`: 2 condominios ficticios, un usuario por rol + superadmin

## Fase 2: Núcleo

- [x] 2.1 RED/GREEN `src/autorizacion/evaluar-permiso.ts`: todos los escenarios de precedencia de la spec
- [x] 2.2 `src/contexto/contexto-solicitud.ts`: ALS + interceptor que lo inicializa (usuario, ip)
- [x] 2.3 RED/GREEN `src/auditoria/auditoria.service.ts`: `registrar(tx, evento)` que descarta campos sensibles
- [x] 2.4 RED/GREEN `src/auth/password.ts`: argon2id + política ≥ 12 caracteres
- [x] 2.5 RED/GREEN `src/auth/sesiones.service.ts`: emitir, rotar, detectar reuso ⇒ revocar familia, cerrar
- [x] 2.6 RED/GREEN `src/auth/mfa.service.ts`: TOTP cifrado AES-256-GCM, códigos de respaldo de un uso
- [x] 2.7 `src/auth/auth.service.ts`: login con bloqueo (5 fallos/15 min), mensaje genérico, nivel `mfa_pendiente`
- [x] 2.8 `src/auth/recuperacion.service.ts`: token 30 min un uso, respuesta idéntica, revoca sesiones; `nodemailer`

## Fase 3: Integración

- [x] 3.1 `src/auth/auth.controller.ts`: login, mfa/registrar, mfa/verificar, refresh (cookie), logout, recuperar, restablecer
- [x] 3.2 Guards globales en `app.module.ts`: Throttler → `JwtGuard` (`@Publico`) → `MfaGuard` → `CondominioGuard` → `PermisoGuard`
- [x] 3.3 `CondominioGuard`: `X-Condominio-Id` + membresía activa o acceso excepcional vigente; si no ⇒ 404
- [x] 3.4 `PermisoGuard` + `@RequierePermiso(area, accion)`; 403 auditado
- [x] 3.5 `src/autorizacion/membresias.controller.ts`: CRUD membresías, concesiones/restricciones (ADMINISTRADORA/superadmin)
- [x] 3.6 `src/autorizacion/acceso-excepcional.controller.ts`: abrir (justificación, ≤ 8 h), revocar; superadmin solo `leer`
- [x] 3.7 Verificación de `Origin` contra `WEB_ORIGIN` en `/auth/refresh`; `cookie-parser`

## Fase 4: Pruebas de integración (Supertest + Postgres)

- [x] 4.1 `test/auth.int.spec.ts`: escenarios de login, inactivo, bloqueo 429, refresh/reuso, logout
- [x] 4.2 `test/mfa.int.spec.ts`: privilegiado sin MFA ⇒ 403; TOTP válido; código de respaldo de un uso
- [x] 4.3 `test/recuperacion.int.spec.ts`: respuesta idéntica, token vencido/usado, revocación de sesiones
- [x] 4.4 `test/autorizacion.int.spec.ts`: §13.1 asistente (aprobar 02, leer 04), OPERACIONES sin 02, CONSEJO sin acceso, membresía desactivada ⇒ 404
- [x] 4.5 `test/aislamiento-api.int.spec.ts`: §13.2 por API: B sin acceso a A (404), multi-membresía
- [x] 4.6 `test/acceso-excepcional.int.spec.ts`: sin acceso 403, vigente auditado, vencido 403
- [x] 4.7 `test/auditoria-accesos.int.spec.ts`: cada evento de la tabla de la spec, antes/después, atomicidad, sin secretos

## Fase 5: Cierre

- [x] 5.1 Actualizar `CLAUDE.md` y skill `nest-module` con guards y `@RequierePermiso`
- [x] 5.2 `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @zulu/api test:integration` en verde
