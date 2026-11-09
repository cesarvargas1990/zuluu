# Propuesta: Pantallas web de acceso y gestión de membresías

## Intención

El API de autenticación y permisos (`auth-roles-permisos`) ya existe, pero nadie puede usarlo sin `curl`. La administradora y su equipo necesitan entrar, configurar MFA, elegir condominio y gestionar quién accede, desde Windows y navegadores actuales, sin formación técnica (§11 usabilidad y accesibilidad).

## Alcance

### Incluido

- Inicio de sesión, verificación MFA, registro de MFA con QR y códigos de respaldo (mostrados una sola vez).
- "Olvidé mi contraseña" y pantalla para definir contraseña (`/restablecer?token=`), que también sirve de bienvenida.
- Sesión: token de acceso solo en memoria, renovación silenciosa con la cookie al cargar y ante 401, cierre de sesión.
- Estructura de la app: encabezado con selector de condominio, usuario y salir; inicio con rol y permisos efectivos del usuario.
- Gestión de membresías (ADMINISTRADORA): listar, agregar persona, cambiar rol, desactivar/reactivar, conceder/restringir permisos y revocarlos.
- Interfaz en español, accesible (teclado, foco visible, etiquetas, estados con texto además de color), responsiva.

### Excluido

- Consola de superadmin (listar/crear condominios, accesos excepcionales): requiere API nueva; cambio aparte.
- Pantallas de módulos de negocio M01–M10.
- Portal de propietarios/Consejo.

## Capacidades

### Nuevas

- `web-acceso`: login, MFA, recuperación, sesión y navegación protegida.
- `web-membresias`: pantallas de gestión de membresías y permisos.

### Modificadas

- Ninguna (el contrato del API no cambia).

## Enfoque

SPA React 19 + Vite con React Router y TanStack Query; cliente HTTP propio con renovación automática; estilos con Tailwind v4 y componentes propios accesibles. Mismo origen vía proxy de Vite (cookie `SameSite=Strict` funciona sin CORS). Pruebas de componentes con Testing Library y E2E con Playwright contra API real + seed.

## Áreas afectadas

| Área              | Impacto    | Descripción                               |
| ----------------- | ---------- | ----------------------------------------- |
| `apps/web/src/`   | Nuevo      | Rutas, páginas, cliente API, componentes  |
| `apps/web/e2e/`   | Nuevo      | Pruebas Playwright                        |
| `packages/shared` | Sin cambio | Se reutilizan roles, áreas, matriz        |
| Raíz              | Modificado | Scripts `test:e2e`, `.claude/launch.json` |

## Riesgos

| Riesgo                                                            | Prob.             | Mitigación                                                          |
| ----------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| Token en memoria se pierde al recargar                            | Alta (por diseño) | Renovación silenciosa al iniciar con cookie httpOnly                |
| Dos pestañas rotan el refresh a la vez ⇒ reuso ⇒ cierre de sesión | Media             | Bloqueo entre pestañas (Web Locks) alrededor de la renovación       |
| UI de permisos confusa                                            | Media             | Mostrar permisos efectivos (matriz + excepciones) en lenguaje claro |

## Rollback

Revertir el commit; el API no cambia, así que no hay migraciones que deshacer.

## Criterios de éxito

- [ ] Una asistente entra sin MFA; una administradora debe configurar/verificar MFA antes de ver la app.
- [ ] Recargar la página mantiene la sesión; cerrar sesión la termina.
- [ ] Una administradora agrega una persona, le concede un permiso y la desactiva sin usar `curl`.
- [ ] Una asistente no ve la gestión de membresías.
- [ ] Todo operable con teclado; E2E y pruebas de componentes en verde.
