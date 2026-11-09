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

- **Tenant**: el servicio recibe `condominioId` y ejecuta todo con `this.prisma.withTenant(condominioId, async (tx) => …)`. Nunca `this.prisma.<modelo>` directo para datos de un condominio.
- **Validación**: entradas con Zod (`schema.parse` en un pipe o en el controller). Rechazar campos desconocidos (`.strict()`). Mensajes en español.
- **Autorización**: denegar por defecto. Verificar rol/permiso (condominio, área, acción) antes de ejecutar; el guard de permisos vive en `src/auth/` cuando exista.
- **Auditoría**: toda escritura sensible inserta en `auditoria` dentro de la **misma** transacción `tx` (antes/después, actor, IP).
- **Errores**: usar excepciones de `@nestjs/common` (`NotFoundException`, `ForbiddenException`…). No filtrar si un recurso de otro condominio existe: responder 404.
- **Dinero**: `Prisma.Decimal`, nunca `number` para montos.
- **Fechas**: guardar `timestamptz`; los plazos legales se calculan con zona `America/Bogota` y calendario de días hábiles cuando aplique.
- **Asíncrono**: procesamiento de documentos (hash, OCR, antivirus) y notificaciones van a cola con reintentos, no en el request.

## Pruebas

- Unit: `pnpm --filter @zulu/api test` (Vitest + SWC, `src/**/*.spec.ts`).
- Integración: `pnpm --filter @zulu/api test:integration` (requiere `pnpm db:up` y migraciones). Patrón de referencia: `test/tenant-isolation.int.spec.ts`.
- Todo endpoint nuevo con datos de condominio incluye un caso "condominio B no ve A" (404/vacío).
- Strict TDD: escribe la prueba que falla primero.

## Verificación antes de terminar

`pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @zulu/api test:integration`
