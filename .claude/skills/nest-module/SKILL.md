---
name: nest-module
description: Convenciones para crear o modificar un módulo NestJS en apps/api de ZULU ADMIN (controladores, servicios, validación con Zod, permisos, auditoría y pruebas con Vitest). Usar al agregar endpoints, un módulo M01–M10 o lógica de servicio en el API.
---

# Módulo NestJS en `apps/api`

## Estructura

```
apps/api/src/<modulo>/            # nombre en español, kebab-case: expedientes, cartera, pqrs…
  <modulo>.module.ts
  <modulo>.controller.ts          # HTTP: rutas, DTOs, guards. Sin lógica de negocio.
  <modulo>.service.ts             # reglas de negocio; recibe condominioId explícito
  dto/<accion>.dto.ts             # esquemas Zod + tipos inferidos
  <modulo>.service.spec.ts        # unit (Vitest, mocks de Prisma)
apps/api/test/<modulo>.int.spec.ts  # integración contra Postgres real (RLS, transacciones)
```

Registrar el módulo en `src/app.module.ts`. Prefijo global: `/api/v1`.

## Reglas

- **Permisos**: cada handler de negocio lleva `@RequierePermiso('<área 01–10>', '<acción>')` (de `src/autorizacion/decoradores.ts`). Sin decorador la ruta solo exige sesión: nunca exponer datos de condominio así. Rutas con `:expedienteId` aplican restricciones por expediente automáticamente.
- **Tenant**: el servicio toma `contexto.actual().condominioId` (fijado por `CondominioGuard`) y ejecuta todo con `this.prisma.withTenant(condominioId, async (tx) => …)`. Nunca `this.prisma.<modelo>` directo para datos de un condominio.
- **Validación**: entradas con Zod (`schema.parse` en un pipe o en el controller). Rechazar campos desconocidos (`.strict()`). Mensajes en español.
- **Autorización**: denegar por defecto; la decide `PermisoGuard` con `evaluarPermiso()`. No dupliques chequeos de rol en servicios.
- **Auditoría**: toda escritura sensible llama `this.auditoria.registrar(tx, { accion, objetoTipo, objetoId, condominioId, antes, despues })` dentro de la **misma** transacción `tx`. Actor e IP salen del contexto.
- **Errores**: usar excepciones de `@nestjs/common` (`NotFoundException`, `ForbiddenException`…). No filtrar si un recurso de otro condominio existe: responder 404.
- **Dinero**: `Prisma.Decimal`, nunca `number` para montos.
- **Fechas**: guardar `timestamptz`; los plazos legales se calculan con zona `America/Bogota` y calendario de días hábiles cuando aplique.
- **Asíncrono**: procesamiento de documentos (hash, OCR, antivirus) y notificaciones van a cola con reintentos, no en el request.

## Pruebas

- Unit: `pnpm --filter @zulu/api test` (Vitest + SWC, `src/**/*.spec.ts`).
- Integración: `pnpm --filter @zulu/api test:integration` (requiere `pnpm db:up` y migraciones). Patrón de referencia: `test/tenant-isolation.int.spec.ts`.
- Todo endpoint nuevo con datos de condominio incluye un caso "condominio B no ve A" (404/vacío).
- Usa `test/helpers/entorno.ts`: `crearEntorno`, `crearCondominio`, `crearUsuario(e, alias, { roles, mfa })`, `iniciarSesion`, `eventos`.
- Strict TDD: escribe la prueba que falla primero.

## Verificación antes de terminar

`pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @zulu/api test:integration`
