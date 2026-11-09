# Especificación: Acceso web

## Propósito

Permitir que el equipo de ZULU entre, proteja su cuenta con MFA y navegue solo por lo que le corresponde (§9, §11).

## Requisitos

### Requisito: Inicio de sesión

La pantalla de ingreso MUST pedir email y contraseña con etiquetas visibles y MUST mostrar los errores del API en texto, asociados al formulario.

#### Escenario: Ingreso sin MFA requerido

- DADO la asistente con credenciales válidas
- CUANDO envía el formulario
- ENTONCES llega al inicio y ve su nombre, condominio y rol

#### Escenario: Credenciales inválidas

- DADO una contraseña incorrecta
- CUANDO envía el formulario
- ENTONCES ve "Email o contraseña incorrectos." y el foco vuelve al campo contraseña

#### Escenario: Cuenta bloqueada

- DADO el API responde 429
- CUANDO envía el formulario
- ENTONCES ve el mensaje de bloqueo y el botón no reintenta automáticamente

### Requisito: Verificación en dos pasos

Si el API indica `mfaRequerido`, la app MUST NOT mostrar contenido protegido hasta completar el MFA.

#### Escenario: MFA configurado

- DADO una contadora con MFA activo
- CUANDO inicia sesión
- ENTONCES ve la pantalla de código; con un código válido llega al inicio

#### Escenario: Código de respaldo

- DADO la pantalla de código
- CUANDO elige "usar código de respaldo" e ingresa uno válido
- ENTONCES llega al inicio

#### Escenario: MFA sin configurar

- DADO una administradora sin MFA
- CUANDO inicia sesión
- ENTONCES ve un QR y la clave en texto, confirma con un código y ve sus 10 códigos de respaldo una sola vez con opción de copiarlos o descargarlos antes de continuar

### Requisito: Persistencia y fin de sesión

El token de acceso MUST guardarse solo en memoria; la sesión MUST recuperarse con la cookie de renovación.

#### Escenario: Recargar la página

- DADO una sesión activa
- CUANDO recarga el navegador
- ENTONCES sigue autenticada sin volver a ingresar

#### Escenario: Token de acceso vencido

- DADO un token de acceso vencido y renovación vigente
- CUANDO hace una acción
- ENTONCES la acción se completa tras renovar, sin intervención

#### Escenario: Renovación inválida

- DADO la renovación fue revocada
- CUANDO la app intenta renovar
- ENTONCES vuelve a la pantalla de ingreso con el aviso "Su sesión terminó"

#### Escenario: Cerrar sesión

- DADO una sesión activa
- CUANDO pulsa "Salir"
- ENTONCES vuelve al ingreso y recargar no restaura la sesión

### Requisito: Recuperación de contraseña

#### Escenario: Solicitar enlace

- DADO la pantalla "Olvidé mi contraseña"
- CUANDO envía cualquier email
- ENTONCES ve siempre el mismo mensaje de confirmación

#### Escenario: Definir contraseña

- DADO un enlace válido `/restablecer?token=…`
- CUANDO ingresa dos contraseñas iguales de ≥ 12 caracteres
- ENTONCES ve confirmación y un enlace al ingreso

#### Escenario: Contraseñas distintas o enlace vencido

- DADO contraseñas que no coinciden, o un token vencido
- CUANDO envía
- ENTONCES ve el error en texto sin perder lo escrito (salvo contraseñas)

### Requisito: Condominio activo

La app MUST enviar el condominio elegido en cada petición y MUST recordarlo por usuario en el navegador.

#### Escenario: Varios condominios

- DADO un usuario con membresías en dos condominios
- CUANDO cambia el selector
- ENTONCES las pantallas muestran datos del condominio elegido

#### Escenario: Sin condominios

- DADO un usuario sin membresías (p. ej. superadmin)
- CUANDO entra
- ENTONCES ve un mensaje que explica que no tiene condominios asignados

### Requisito: Accesibilidad

Todas las pantallas MUST operarse con teclado, con foco visible, `lang="es"`, títulos de página, mensajes de estado anunciados (`role="status"`/`alert`) y sin depender solo del color.

#### Escenario: Recorrido con teclado

- DADO la pantalla de ingreso
- CUANDO se usa solo Tab, Shift+Tab y Enter
- ENTONCES se puede ingresar y llegar al inicio
