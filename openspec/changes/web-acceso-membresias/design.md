# Diseño: Pantallas web de acceso y gestión de membresías

## Enfoque técnico

SPA en `apps/web` que habla con el API por el proxy de Vite (mismo origen). Un `SesionProvider` guarda el token de acceso en memoria y expone el estado de sesión; un cliente `api()` añade `Authorization` y `X-Condominio-Id`, y ante 401 renueva una vez y reintenta. React Router protege rutas según el estado de sesión (anónima → pendiente MFA → completa).

## Decisiones

| Tema                   | Opciones                                           | Decisión y porqué                                                                                                                           |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Enrutamiento           | TanStack Router · React Router 7 (modo librería)   | **React Router 7**: estándar, simple, suficiente para ~8 rutas                                                                              |
| Datos del servidor     | fetch + useEffect · TanStack Query                 | **TanStack Query 5**: caché, reintentos, invalidación tras mutaciones; claves incluyen `condominioId`                                       |
| Formularios            | react-hook-form · nativos + Zod                    | **Nativos controlados + Zod** de esquemas propios: pocos formularios, sin dependencia extra                                                 |
| Estilos                | CSS propio · Tailwind v4 · librería de componentes | **Tailwind v4 + componentes propios** (Button, Field, Dialog sobre `<dialog>`, Badge con texto). Control total de accesibilidad y peso bajo |
| Token                  | localStorage · memoria                             | **Memoria** (no expuesto a XSS persistente); refresh en cookie httpOnly                                                                     |
| Renovación concurrente | sin control · Web Locks                            | **`navigator.locks.request('zulu-refresh')`** + promesa compartida en la pestaña: evita reuso por rotación paralela                         |
| QR de MFA              | servicio externo · librería local                  | **`qrcode` local** (el secreto nunca sale del navegador)                                                                                    |
| Condominio activo      | URL · estado                                       | **Estado en contexto + `localStorage` por usuario** (solo preferencia, no dato sensible)                                                    |
| Pruebas                | —                                                  | **Vitest + Testing Library (jsdom)** para componentes/cliente; **Playwright** E2E contra API real + seed                                    |

## Rutas

| Ruta              | Acceso                       | Pantalla                                    |
| ----------------- | ---------------------------- | ------------------------------------------- |
| `/ingresar`       | anónimo                      | Login                                       |
| `/mfa`            | pendiente MFA                | Verificar código / respaldo                 |
| `/mfa/configurar` | pendiente MFA sin configurar | QR + confirmar + códigos de respaldo        |
| `/olvide`         | anónimo                      | Solicitar enlace                            |
| `/restablecer`    | público                      | Definir contraseña (`?token=`)              |
| `/`               | completa                     | Inicio: condominio, rol, permisos efectivos |
| `/personas`       | completa + ADMINISTRADORA    | Membresías y permisos                       |
| `*`               | —                            | No encontrado                               |

## Flujo de sesión

```
carga app ─► POST /auth/refresh (cookie) ─┬─ 200 ─► GET /auth/yo ─► estado según mfa {requerido, verificado}
                                          └─ 401 ─► anónimo ─► /ingresar
api(): 401 ─► renovar() (lock) ─┬─ ok ─► reintenta 1 vez
                                └─ falla ─► anónimo + aviso "Su sesión terminó"
```

El estado pendiente de MFA permite solo `/mfa*` y "Salir".

## Estructura de archivos

| Archivo                                    | Acción                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/api/cliente.ts`                       | `api<T>(ruta, opciones)`: base `/api/v1`, headers, JSON, `ErrorApi` con status y mensaje, renovación y reintento |
| `src/api/auth.ts`, `src/api/membresias.ts` | Funciones tipadas por endpoint                                                                                   |
| `src/sesion/SesionProvider.tsx`            | Token en memoria, `yo`, condominio activo, `ingresar/salir/actualizar`                                           |
| `src/sesion/rutas-protegidas.tsx`          | `RequiereAnonimo`, `RequiereMfaPendiente`, `RequiereSesion`, `RequiereRol`                                       |
| `src/paginas/*`                            | Ingresar, Mfa, MfaConfigurar, Olvide, Restablecer, Inicio, Personas, NoEncontrado                                |
| `src/componentes/*`                        | Button, Field, Alert, Dialog, Badge, Layout (encabezado + selector de condominio + salir)                        |
| `src/permisos/efectivos.ts`                | Permisos efectivos por área = matriz del rol ± explícitos (reutiliza `@zulu/shared`)                             |
| `src/main.tsx`, `src/App.tsx`              | Router + QueryClient + SesionProvider                                                                            |
| `e2e/*.spec.ts`, `playwright.config.ts`    | E2E con usuarios del seed                                                                                        |
| `vite.config.ts`                           | Tailwind, alias `@/`, `test` (jsdom)                                                                             |

## Interfaces

```ts
class ErrorApi extends Error {
  status: number;
  errores?: { campo: string; mensaje: string }[];
}
type EstadoSesion =
  | { tipo: 'cargando' }
  | { tipo: 'anonimo'; aviso?: string }
  | { tipo: 'mfa'; configurado: boolean; yo: Yo }
  | { tipo: 'activa'; yo: Yo };
```

## Diseño visual

Tema claro sobrio (fondo neutro, acento verde petróleo afín al documento de ZULU), tipografía del sistema, contraste AA, foco visible de 2 px. Usar skills `ui-ux-pro-max` y `better-accessibility` durante la implementación; textos con `better-writing`.

## Estrategia de pruebas

| Capa        | Qué                                                                                                                      | Cómo                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Unit        | `cliente.ts` (401→renovar→reintento, error en español), `efectivos.ts`                                                   | Vitest, `fetch` simulado                                                                           |
| Componentes | Ingresar (errores, foco), MfaConfigurar (códigos una vez), Personas (visibilidad, diálogo, Escape)                       | Testing Library + jsdom, API simulada                                                              |
| E2E         | Asistente entra y recarga; contadora con TOTP; administradora agrega/concede/desactiva; asistente sin `/personas`; salir | Playwright contra `pnpm dev` + seed; TOTP generado con `otplib` desde secreto fijado en el fixture |

## Migración

No aplica. Para E2E se agrega un fixture que fija un secreto TOTP conocido a un usuario de prueba vía rol owner.

## Preguntas abiertas

- [ ] ¿Colores/logo oficiales de ZULU? (se usa paleta neutra provisional)
