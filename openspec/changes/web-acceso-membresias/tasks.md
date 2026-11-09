# Tareas: Pantallas web de acceso y gestión de membresías

Strict TDD: RED antes de GREEN en lógica y componentes.

## Fase 1: Fundación

- [x] 1.1 Instalar React Router 7, TanStack Query 5, Tailwind v4, `qrcode`; Vitest + Testing Library + jsdom; alias `@/`
- [x] 1.2 `index.css`: tokens de color, foco visible, tipografía; `lang="es"` ya presente
- [x] 1.3 RED/GREEN `src/api/cliente.ts`: headers, `ErrorApi`, 401 ⇒ renovar una vez ⇒ reintentar; falla ⇒ evento de sesión terminada
- [x] 1.4 RED/GREEN renovación con `navigator.locks` y promesa compartida (dos llamadas concurrentes ⇒ un refresh)
- [x] 1.5 `src/api/auth.ts`, `src/api/membresias.ts` tipados contra el API

## Fase 2: Sesión y estructura

- [x] 2.1 RED/GREEN `SesionProvider`: arranque con refresh, estados `cargando/anonimo/mfa/activa`, condominio activo por usuario
- [x] 2.2 Guards de ruta y `App.tsx` con rutas del diseño
- [x] 2.3 Componentes base: Button, Field, Alert (`role=alert/status`), Dialog (`<dialog>`, Escape, devolver foco), Badge con texto
- [x] 2.4 Layout: encabezado con selector de condominio, nombre, rol, "Salir"; título de página por ruta

## Fase 3: Pantallas de acceso

- [x] 3.1 RED/GREEN `Ingresar`: errores 401/429 en texto, foco a contraseña tras error
- [x] 3.2 `Mfa`: código TOTP o "usar código de respaldo"
- [x] 3.3 RED/GREEN `MfaConfigurar`: QR local + clave en texto, confirmar, códigos de respaldo una vez (copiar/descargar) antes de continuar
- [x] 3.4 `Olvide` y `Restablecer` (coincidencia de contraseñas, ≥ 12, token inválido)
- [x] 3.5 `Inicio`: condominio, rol y permisos efectivos por área; mensaje si no tiene condominios

## Fase 4: Personas y permisos

- [x] 4.1 RED/GREEN `src/permisos/efectivos.ts`: matriz ± concesiones/restricciones de área
- [x] 4.2 RED/GREEN `Personas`: visible solo a ADMINISTRADORA; listado con estado en texto
- [x] 4.3 Agregar persona (nombre, email, rol) con errores por campo y aviso de correo
- [x] 4.4 Cambiar rol; desactivar/reactivar con diálogo de confirmación que nombra a la persona
- [x] 4.5 Panel de permisos: efectivos por área, conceder/restringir (área, acción, expediente opcional), revocar con confirmación

## Fase 5: E2E y cierre

- [x] 5.1 Playwright: config, `webServer` reutilizando servidores, fixture de TOTP conocido
- [x] 5.2 E2E asistente: ingresar, recargar mantiene sesión, sin enlace ni acceso a `/personas`, salir
- [x] 5.3 E2E contadora con TOTP; administradora sin MFA ve QR y códigos
- [x] 5.4 E2E administradora: agregar persona, conceder Jurídica a asistente, desactivar
- [x] 5.5 E2E recorrido solo con teclado del ingreso
- [x] 5.6 Actualizar `CLAUDE.md`, `openspec/config.yaml` (E2E disponible); typecheck, lint, test, e2e en verde
