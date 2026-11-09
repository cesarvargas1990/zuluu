---
name: prisma-tenant-table
description: Cómo agregar o cambiar tablas en PostgreSQL con Prisma en ZULU ADMIN manteniendo aislamiento multi-tenant (RLS), grants del rol zulu_app y auditoría. Usar al editar apps/api/prisma/schema.prisma, crear migraciones o tocar políticas RLS.
---

# Tablas multi-tenant con Prisma + RLS

## Modelo de seguridad

- `DATABASE_URL` → rol owner `zulu`: **solo migraciones** y pruebas de setup.
- `APP_DATABASE_URL` → rol `zulu_app`: runtime, sin BYPASSRLS, sujeto a RLS.
- `PrismaService.withTenant(id, fn)` hace `set_config('app.condominio_id', id, true)` en la transacción; las políticas usan `app_condominio_id()`.
- Sin tenant fijado, las tablas con RLS devuelven 0 filas (falla cerrada).

## Pasos para una tabla nueva con datos de condominio

1. En `schema.prisma`: modelo en español (PascalCase), `@@map("snake_case")`, campos `@map("snake_case")`, `id String @id @default(uuid()) @db.Uuid`, `condominioId String @map("condominio_id") @db.Uuid` + relación + `@@index([condominioId])`. Fechas `@db.Timestamptz(3)`. Dinero `@db.Decimal(18,2)`.
2. Crear migración sin aplicar:
   `cd apps/api && npx dotenv -e ../../.env -- prisma migrate dev --name <nombre> --create-only`
3. Añadir al final del `migration.sql`:
   ```sql
   GRANT SELECT, INSERT, UPDATE ON "<tabla>" TO zulu_app;   -- DELETE solo si el dominio lo permite
   ALTER TABLE "<tabla>" ENABLE ROW LEVEL SECURITY;
   CREATE POLICY <tabla>_tenant ON "<tabla>"
     USING ("condominio_id" = app_condominio_id())
     WITH CHECK ("condominio_id" = app_condominio_id());
   ```
   Tablas append-only (bitácoras, movimientos confirmados, versiones de documento): solo `SELECT, INSERT`.
4. Aplicar: `pnpm db:migrate`.
5. Prueba de integración: el condominio B no ve ni puede escribir filas del A (seguir `apps/api/test/tenant-isolation.int.spec.ts`).

## Reglas

- Nunca editar una migración ya aplicada/commiteada; crear una nueva.
- Nunca `prisma db push` fuera de experimentos locales.
- Borrado lógico (`eliminadoEn`) + auditoría en vez de DELETE para datos de negocio.
- Tablas globales (sin tenant, p. ej. `usuario`) se justifican explícitamente en el diseño.
- Seeds solo con datos ficticios.
