# Progreso de implementación: web-acceso-membresias

**Modo**: Strict TDD · **Estado**: 24/24 tareas · web 34 unit/componentes + 5 E2E; API 48 integración (2026-11-09)

## Evidencia TDD

| Tarea                               | RED                                                    | GREEN                            | Triangulación / Refactor                                                                         |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1.3–1.4 Cliente y renovación        | `cliente.test.ts` falló (módulo inexistente)           | `cliente.ts`, `renovacion.ts`    | 11 casos: headers, 204, 401→renovar, fallo, sin renovar, validación, red, concurrencia           |
| 2.1 SesionProvider                  | `SesionProvider.test.tsx` falló                        | `SesionProvider.tsx`, `token.ts` | anónimo, recupera, recuerda condominio, MFA, salir                                               |
| 3.1–3.3 Ingreso y MFA               | `Ingresar.test.tsx`, `MfaConfigurar.test.tsx` fallaron | páginas                          | 401/429/éxito/MFA; el test de MFA detectó un bug (ver abajo)                                     |
| 4.1 Permisos efectivos              | `efectivos.test.ts` falló                              | `efectivos.ts`                   | 5 casos de precedencia y orden                                                                   |
| 4.2–4.5 Personas                    | `Personas.test.tsx` falló                              | `Personas.tsx`                   | visibilidad, listado, alta, error por campo, desactivar/Escape, propia, conceder, correo fallido |
| 5.x E2E                             | 5 escenarios Playwright                                | —                                | detectó fallo de correo ⇒ corrección en API                                                      |
| 1.1–1.2, 2.3–2.4 Estructura/estilos | Estructural                                            | —                                | Cubierto por pruebas de componentes y E2E                                                        |

## Desviaciones y hallazgos

- **Bug corregido (web)**: un código MFA incorrecto (401) se interpretaba como sesión vencida y cerraba la sesión. Los endpoints de MFA ya no renuevan ante 401.
- **Bug corregido (API)**: si el SMTP fallaba, `POST /membresias` respondía 500 aunque la persona quedaba creada, y `/auth/recuperar` respondía distinto según existiera la cuenta. Ahora el fallo se registra (log + auditoría `correoEnviado: false`) y el alta devuelve `correoEnviado`; la web avisa cómo definir la clave. Pruebas de integración agregadas.
- **Orden de áreas**: `Object.keys(AREAS)` ponía "10" primero; se agregó `AREA_CODIGOS` en `@zulu/shared`.
- **Identidad visual**: se aplicaron los colores del logo de ZULU entregado durante la implementación; logo vectorial aproximado hasta recibir el original.
- Skills de diseño (`ui-ux-pro-max`, `better-accessibility`) no se cargaron; se aplicaron sus criterios básicos (foco visible, etiquetas, `role=alert/status`, estados con texto, objetivos táctiles ≥ 44 px).

## Pendiente

- Logo original de ZULU (SVG/PNG) para reemplazar el vector aproximado.
- `.env` local: `AUTH_RATE_LIMIT=100` para poder correr E2E repetidamente (`.env.example` mantiene 10).
- Consola de superadmin (cambio aparte).
