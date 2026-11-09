# Progreso de implementación: auth-roles-permisos

**Modo**: Strict TDD · **Estado**: 31/31 tareas · 26 unit + 46 integración en verde (2026-11-09)

## Evidencia TDD

| Tarea                                 | RED (prueba primero)                              | GREEN                     | Triangulación / Refactor                                                |
| ------------------------------------- | ------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| 1.2–1.3 Matriz                        | `permisos.spec.ts` falló (módulo inexistente)     | `permisos.ts`             | 6 casos por rol; matriz con helpers `LCE/LC/L`                          |
| 2.1 evaluarPermiso                    | `evaluar-permiso.spec.ts` falló                   | `evaluar-permiso.ts`      | 10 casos: rol, concesión, restricción área/expediente, multi-rol, vacío |
| 2.3 Sanitizar auditoría               | `sanitizar.spec.ts` falló                         | `sanitizar.ts`            | anidado, arrays, nulos, undefined                                       |
| 2.4 Contraseñas                       | `password.spec.ts` falló                          | `password.ts`             | corta/larga/válida; hash inválido ⇒ false                               |
| 2.6 Cifrado TOTP/tokens               | `cifrado.spec.ts` falló                           | `cifrado.ts`, `tokens.ts` | IV aleatorio, alteración, clave errónea                                 |
| 2.5, 2.7–2.8, 3.x Servicios y guards  | Escenarios de integración escritos contra la spec | servicios/guards          | Integración: 46 casos; refactor `usarCodigoRespaldo` (lint)             |
| 1.4–1.7 Esquema, migración, env, seed | Estructural (sin lógica ramificada)               | —                         | Triangulación omitida: estructura/config; cubierto por integración      |

## Desviaciones del diseño

- **Códigos de respaldo con SHA-256** en vez de argon2: son aleatorios de 40 bits, el hash lento no aporta y evita 10 hashes argon2 por registro.
- **Varias membresías por condominio**: `evaluarPermiso` recibe `roles[]` (el diseño decía `rol`); basta que un rol permita, salvo restricción.
- **Auditoría con `createMany`**: Prisma `create` usa `RETURNING`, que exige pasar la política SELECT de RLS; los eventos sin condominio no son legibles (correcto) y fallaban.
- **Función `app_membresias_de_usuario` (SECURITY DEFINER)**: necesaria para saber en el login si el usuario requiere MFA y listar sus condominios sin romper RLS.
- **Alta de usuarios**: `POST /membresias` crea el usuario si no existe y envía enlace de bienvenida (reutiliza recuperación).
- **Se revocó DELETE** a `zulu_app` en `condominio`, `usuario`, `membresia` (antes lo tenía).

## Pendiente / riesgos

- Throttler en memoria: con varias instancias del API se necesita almacenamiento compartido (Redis).
- Sin prevención de reuso del mismo código TOTP dentro de su ventana de 30 s.
- Matriz de permisos aún sin validar con ZULU.
