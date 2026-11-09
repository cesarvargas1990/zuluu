# Diseño: Autenticación, roles y permisos (MVP)

## Enfoque técnico

Dos módulos Nest (`auth`, `autorizacion`) más una cadena de **guards globales** que resuelve identidad, nivel de sesión (MFA), condominio y permiso antes de cada controlador. El contexto queda en `AsyncLocalStorage` y los servicios lo leen para llamar a `prisma.withTenant`. La auditoría se escribe en la misma transacción que el cambio.

## Decisiones de arquitectura

| Tema                   | Opciones                                     | Decisión y porqué                                                                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hash de contraseña     | bcrypt · argon2 (nativo) · `@node-rs/argon2` | **`@node-rs/argon2` (argon2id)**: recomendado por OWASP, binario precompilado sin scripts de build                                                                                                                                                                                     |
| Tokens                 | sesión en servidor · JWT + refresh           | **JWT de acceso 15 min en `Authorization` + refresh opaco en cookie httpOnly `SameSite=Strict`, path `/api/v1/auth`**. API sin cookies salvo refresh → CSRF limitado a un endpoint, protegido además con verificación de `Origin`                                                      |
| Refresh                | JWT · opaco con hash                         | **Opaco (32 bytes), SHA-256 en `sesion`, rotación por familia**; reuso ⇒ revoca familia                                                                                                                                                                                                |
| MFA                    | TOTP · WebAuthn · SMS                        | **TOTP (`otplib`)** + 10 códigos de respaldo (argon2). Secreto cifrado AES-256-GCM con `MFA_ENC_KEY` (env). WebAuthn después                                                                                                                                                           |
| Fuerza bruta           | solo rate limit · + bloqueo por cuenta       | **`@nestjs/throttler` por IP (memoria, 1 instancia MVP)** + `intentos_fallidos`/`bloqueado_hasta` en `usuario` (5 fallos ⇒ 15 min)                                                                                                                                                     |
| Superadmin             | rol en membresía · bandera global            | **`usuario.es_superadmin`**; se elimina `SUPERADMIN_ZULU` del enum `Rol` (no pertenece a un condominio). Acceso a datos de negocio solo vía `acceso_excepcional`, **solo `leer`**; sí puede gestionar condominios, membresías y permisos (§2) sin acceso excepcional, siempre auditado |
| Contexto de condominio | subdominio · ruta · header                   | **Header `X-Condominio-Id`**; simple para SPA y pruebas; validado contra membresía en cada request (revocación inmediata)                                                                                                                                                              |
| Evaluación             | en guard · función pura                      | **Función pura `evaluarPermiso()`** (testeable sin BD); guard solo carga datos                                                                                                                                                                                                         |
| Correo                 | proveedor · SMTP                             | **`nodemailer` → SMTP** (Mailpit en dev); proveedor queda para §16                                                                                                                                                                                                                     |

## Flujo de una petición

```
Request ─► Throttler ─► JwtGuard ─► MfaGuard ─► CondominioGuard ─► PermisoGuard ─► Controller
            (IP)       (@Publico     (sesión     (X-Condominio-Id     (@RequierePermiso
                        omite)        mfa ok)     + membresía o        área, acción;
                                                   acceso excepcional) evaluarPermiso)
                                         │
                       ContextoSolicitud (ALS): usuarioId, condominioId, rol, ip, accesoExcepcionalId
```

Login: `POST /auth/login` → (bloqueado? 429) → verificar argon2 → requiere MFA? ⇒ sesión `mfa_pendiente` → `POST /auth/mfa/verificar` → sesión completa. Recurso inexistente o de otro condominio ⇒ **404**; sin permiso en su condominio ⇒ **403**.

## Precedencia de permisos

`RESTRINGIR` explícito (expediente > área) ⇒ deniega · `CONCEDER` explícito ⇒ permite · matriz del rol ⇒ permite · si no ⇒ deniega.

## Matriz por defecto (borrador, validar con ZULU)

Áreas: 01 Adm · 02 Fin · 03 Contr · 04 Jur · 05 Infra · 06 Amb · 07 Seg · 08 PQRS · 09 Consejo · 10 Personal. Letras: L leer, C crear, E editar, A aprobar, X exportar, D eliminar (lógico).

| Rol             | Permisos                                                                |
| --------------- | ----------------------------------------------------------------------- |
| ADMINISTRADORA  | todas las áreas: L C E A X D                                            |
| ASISTENTE       | 01, 03, 05, 06, 07, 08, 09, 10: L C E · 02: C (cargar soportes) · 04: — |
| CONTADORA       | 02: L C E A X · 01, 03, 10: L                                           |
| ASESOR_JURIDICO | 04: L C E X · 03: L C E · 02: L                                         |
| OPERACIONES     | 05: L C E · 06, 07: L C                                                 |
| CONSEJO         | —                                                                       |

## Modelo de datos

| Tabla                | Tenant/RLS | Campos clave                                                                                                                          |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `usuario` (mod.)     | global     | + `es_superadmin`, `intentos_fallidos`, `bloqueado_hasta`, `mfa_secreto_cifrado`, `mfa_activado_en`                                   |
| `codigo_respaldo`    | global     | `usuario_id`, `hash`, `usado_en`                                                                                                      |
| `sesion`             | global     | `usuario_id`, `familia_id`, `refresh_hash` único, `mfa_verificado`, `expira_en`, `revocada_en`, `reemplazada_por`, `ip`, `user_agent` |
| `token_recuperacion` | global     | `usuario_id`, `hash` único, `expira_en`, `usado_en`                                                                                   |
| `permiso`            | **RLS**    | `condominio_id`, `membresia_id`, `area`, `accion`, `expediente_id?`, `efecto` CONCEDER/RESTRINGIR, `creado_por`                       |
| `acceso_excepcional` | **RLS**    | `condominio_id`, `usuario_id`, `justificacion`, `vence_en` (≤ 8 h), `revocado_en`                                                     |

Grants `zulu_app`: S/I/U en todas; sin DELETE (revocar = `revocado_en`/`activo=false`). Tablas globales solo se consultan desde `auth/`.

## Cambios de archivos

| Archivo                                       | Acción                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/permisos.ts`             | Crear: tipos `Area`, `Accion`, `MATRIZ_PERMISOS`, `ROLES_CON_MFA`                                                                   |
| `packages/shared/src/roles.ts`                | Modificar: quitar `SUPERADMIN_ZULU`                                                                                                 |
| `apps/api/prisma/schema.prisma` + migración   | Modificar/crear: tablas y RLS de arriba                                                                                             |
| `apps/api/src/contexto/`                      | Crear: ALS `ContextoSolicitud`                                                                                                      |
| `apps/api/src/auditoria/auditoria.service.ts` | Crear: `registrar(tx, evento)` sin datos sensibles                                                                                  |
| `apps/api/src/auth/`                          | Crear: controller, service, sesiones, mfa, recuperación, `JwtGuard`, `MfaGuard`, `@Publico`                                         |
| `apps/api/src/autorizacion/`                  | Crear: `CondominioGuard`, `PermisoGuard`, `@RequierePermiso`, `evaluarPermiso`, endpoints de membresías/permisos/acceso excepcional |
| `apps/api/src/app.module.ts`                  | Modificar: guards globales, throttler, cookie-parser                                                                                |
| `.env.example`                                | Modificar: `JWT_ACCESS_SECRET`, `MFA_ENC_KEY`, `WEB_ORIGIN`                                                                         |

Consumo de `@zulu/shared` desde el API (CommonJS): compilar `shared` a `dist` (CJS + tipos) con `tsc`.

## Interfaces

```ts
@RequierePermiso('02', 'aprobar')          // área, acción
@Post('facturas/:id/aprobar') aprobar() {}

evaluarPermiso(entrada: {
  rol: Rol; permisos: PermisoExplicito[]; area: AreaCodigo; accion: Accion; expedienteId?: string;
}): { permitido: boolean; motivo: 'restriccion' | 'concesion' | 'rol' | 'sin_permiso' }
```

## Estrategia de pruebas

| Capa        | Qué                                                                                                            | Cómo                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Unit        | `evaluarPermiso` (cada escenario de la spec), rotación/reuso de refresh, cifrado TOTP, política de contraseñas | Vitest, sin BD                                                                                         |
| Integración | login/MFA/bloqueo/recuperación, §13.1, aislamiento A/B por API, auditoría atómica e inalterable                | Vitest + Supertest contra Nest + Postgres real (rol `zulu_app`), Mailpit opcional (mock de transporte) |
| E2E         | —                                                                                                              | En el cambio de pantallas web                                                                          |

## Migración

Migración aditiva. Quitar `SUPERADMIN_ZULU` del enum es seguro (sin datos). Seed de dev con datos ficticios: 2 condominios, un usuario por rol.

## Preguntas abiertas

- [ ] ¿La matriz por defecto refleja la operación real de ZULU? (no bloquea: es configurable)
- [ ] ¿El superadmin debe poder exportar durante un acceso excepcional? (diseño: no)
- [ ] TTL de sesión de renovación: propuesto 12 h inactividad / 7 días máx.
