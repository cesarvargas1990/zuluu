# Progreso: admin-usuarios

**Estado**: 8/8 · API 33 unit + 60 integración, web 42, E2E 6 (incluye correo real vía Mailpit) · desplegado 2026-11-10

## TDD

| Pieza                              | RED                                                   | GREEN                           |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------- |
| Correos de invitación/recuperación | `correos.spec.ts`                                     | `correos.ts`                    |
| Endpoints `/admin/*`               | `test/admin.int.spec.ts` (10 fallos)                  | `src/admin/*`                   |
| Variables SMTP vacías              | `env.spec.ts` (fallo con `SMTP_SECURE=''`)            | `env.ts`                        |
| Pantallas Usuarios y Condominios   | `AdminUsuarios.test.tsx`, `AdminCondominios.test.tsx` | páginas en `src/paginas/admin/` |
| Flujo completo                     | `e2e/superadmin.spec.ts`                              | —                               |

## Despliegue

- Respaldo: `~/backups/zulu/zulu_admin-20261110-155648.sql.gz` y `codigo-20261110-155650.tar.gz`.
- Migración `20261110120000_admin_superadmin` aplicada en producción.

## Pendiente

- Configurar Gmail (`ZULU_SMTP_*`) en `~/zuluu/.env` del servidor; hasta entonces las invitaciones devuelven `correoEnviado: false`.
