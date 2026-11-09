# Propuesta: Autenticación, roles y permisos (MVP)

## Intención

Ningún módulo (M01–M10) puede construirse sin saber **quién** actúa y **sobre qué condominio/área**. La spec exige MFA para perfiles privilegiados, permisos por condominio/área/acción/expediente, denegación por defecto y auditoría de accesos (§2, §9, §13.1).

## Alcance

### Incluido

- Login email + contraseña (argon2id), logout, sesiones con access JWT corto + refresh rotativo (hash en BD, cookie httpOnly).
- MFA TOTP obligatorio para superadmin ZULU, ADMINISTRADORA, CONTADORA, ASESOR_JURIDICO; códigos de respaldo.
- Recuperación segura de contraseña (token de un solo uso, 30 min, revoca sesiones).
- Protección fuerza bruta: rate limit por IP + bloqueo progresivo por cuenta.
- Contexto de condominio por request (`X-Condominio-Id`) validado contra membresía → `withTenant`.
- Matriz de permisos por rol (por defecto) + concesiones/restricciones explícitas por membresía (área, acción, expediente opcional). Denegar por defecto.
- Guard `@RequierePermiso(area, accion)` reutilizable por los módulos.
- Acceso excepcional de superadmin: justificación, vigencia limitada, auditado.
- Auditoría de: login ok/fallido, logout, MFA, recuperación, cambios de membresía/permisos, accesos excepcionales.
- Endpoints de administración de membresías y permisos.

### Excluido

- Pantallas web de login/admin (cambio siguiente).
- SSO/OAuth, portal de propietarios/Consejo.
- Aplicación de permisos por expediente en datos reales (el campo existe; se usa cuando llegue M01).
- Envío de correo real (Mailpit en dev; proveedor en decisión §16).

## Capacidades

### Nuevas

- `autenticacion`: login, sesiones, refresh, logout, MFA, recuperación, fuerza bruta.
- `autorizacion`: membresías, contexto de condominio, matriz rol→permisos, concesiones, guard, acceso excepcional.
- `auditoria-accesos`: eventos de seguridad registrados en `auditoria`.

### Modificadas

- Ninguna (no hay specs previas).

## Enfoque

Módulos Nest `auth/` y `autorizacion/`. Matriz por defecto en `packages/shared` (fuente única para API y web). Tablas nuevas: `sesion`, `token_recuperacion`, `codigo_respaldo`, `permiso`, `acceso_excepcional` (MFA y bloqueo en `usuario`); RLS donde haya `condominio_id`. Identidad (`usuario`, `sesion`) es global y se accede solo desde `auth`.

## Áreas afectadas

| Área                              | Impacto    | Descripción                                  |
| --------------------------------- | ---------- | -------------------------------------------- |
| `apps/api/src/auth/`              | Nuevo      | Login, sesiones, MFA, recuperación           |
| `apps/api/src/autorizacion/`      | Nuevo      | Guard, contexto tenant, membresías, permisos |
| `apps/api/prisma/`                | Modificado | Tablas + migración RLS                       |
| `packages/shared/src/permisos.ts` | Nuevo      | Matriz rol→área→acción                       |
| `apps/api/test/`                  | Nuevo      | Integración: aislamiento, §13.1              |

## Riesgos

| Riesgo                                                       | Prob. | Mitigación                                              |
| ------------------------------------------------------------ | ----- | ------------------------------------------------------- |
| Matriz por defecto no coincide con la operación real de ZULU | Media | Matriz configurable; validar con ZULU (§14 organigrama) |
| Fuga entre condominios por guard mal aplicado                | Baja  | Guard global deny-by-default + RLS + pruebas A/B        |
| Robo de refresh token                                        | Baja  | Rotación con detección de reuso → revoca familia        |

## Rollback

Revertir el commit del cambio y ejecutar migración inversa (drop de tablas nuevas); no altera `condominio`, `membresia` ni `auditoria` existentes.

## Dependencias

- Organigrama/roles reales de ZULU para ajustar la matriz (no bloquea).

## Criterios de éxito

- [ ] Asistente recibe 403 al aprobar pagos y al leer área jurídica restringida (§13.1).
- [ ] Usuario de B recibe 404/403 sobre recursos de A por API (§13.2).
- [ ] Perfil privilegiado sin MFA no obtiene sesión completa.
- [ ] 100 % de eventos de seguridad listados quedan en `auditoria`.
- [ ] typecheck, lint, unit e integración en verde.
