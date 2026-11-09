# Especificación: Autenticación

## Propósito

Identificar de forma robusta a los usuarios internos de ZULU ADMIN y proteger sus sesiones (§9).

## Requisitos

### Requisito: Inicio de sesión con credenciales

El sistema MUST autenticar con email y contraseña y MUST NOT revelar si el email existe.

#### Escenario: Credenciales válidas sin MFA requerido

- DADO un usuario activo con rol ASISTENTE y contraseña correcta
- CUANDO inicia sesión
- ENTONCES recibe una sesión completa (acceso + renovación)

#### Escenario: Credenciales inválidas o usuario inexistente

- DADO un email inexistente o una contraseña incorrecta
- CUANDO intenta iniciar sesión
- ENTONCES recibe 401 con el mismo mensaje genérico en ambos casos

#### Escenario: Usuario inactivo

- DADO un usuario con `activo = false`
- CUANDO inicia sesión con credenciales correctas
- ENTONCES recibe 401 genérico

### Requisito: MFA para perfiles privilegiados

El sistema MUST exigir TOTP a superadministradores ZULU y a usuarios con alguna membresía ADMINISTRADORA, CONTADORA o ASESOR_JURIDICO. Sin MFA verificado, la sesión MUST quedar limitada a completar el MFA.

#### Escenario: Privilegiado con MFA configurado

- DADO una CONTADORA con TOTP activo
- CUANDO envía credenciales correctas y luego un código TOTP válido
- ENTONCES recibe sesión completa

#### Escenario: Privilegiado sin MFA configurado

- DADO una ADMINISTRADORA sin TOTP
- CUANDO inicia sesión
- ENTONCES solo puede registrar su TOTP; cualquier otro endpoint responde 403

#### Escenario: Código de respaldo

- DADO un usuario con códigos de respaldo
- CUANDO usa uno válido en lugar del TOTP
- ENTONCES obtiene sesión y ese código queda inutilizable

### Requisito: Sesiones y renovación

El acceso SHALL expirar en ≤ 15 min; la renovación MUST rotar en cada uso y MUST detectar reuso.

#### Escenario: Renovación normal

- DADO un token de renovación vigente
- CUANDO se renueva
- ENTONCES recibe nuevo par y el anterior queda inválido

#### Escenario: Reuso de token de renovación

- DADO un token de renovación ya usado
- CUANDO se presenta de nuevo
- ENTONCES se revocan todas las sesiones de esa familia y responde 401

#### Escenario: Cierre de sesión

- DADO una sesión activa
- CUANDO el usuario cierra sesión
- ENTONCES su token de renovación deja de funcionar

### Requisito: Protección contra fuerza bruta

El sistema MUST limitar intentos por IP y MUST bloquear temporalmente la cuenta tras 5 fallos consecutivos.

#### Escenario: Bloqueo por intentos fallidos

- DADO 5 intentos fallidos consecutivos para un email
- CUANDO se intenta de nuevo, incluso con la contraseña correcta
- ENTONCES responde 429 hasta que venza el bloqueo

### Requisito: Recuperación de contraseña

El sistema MUST enviar un enlace de un solo uso válido 30 min, MUST responder igual exista o no el email y MUST revocar todas las sesiones al cambiar la contraseña.

#### Escenario: Recuperación exitosa

- DADO un token de recuperación vigente
- CUANDO se define una contraseña nueva que cumple la política
- ENTONCES se actualiza, el token se invalida y se cierran todas las sesiones

#### Escenario: Token vencido o usado

- DADO un token vencido o ya usado
- CUANDO se intenta usar
- ENTONCES responde 400 sin cambiar nada

### Requisito: Política de contraseñas

Las contraseñas MUST tener ≥ 12 caracteres y MUST NOT almacenarse en texto plano ni registrarse en logs.

#### Escenario: Contraseña corta

- DADO una contraseña de 8 caracteres
- CUANDO se intenta establecer
- ENTONCES responde 400 con mensaje en español
