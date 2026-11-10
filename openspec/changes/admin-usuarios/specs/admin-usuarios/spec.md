# Especificación: Administración de usuarios (superadmin)

## Requisitos

### Requisito: Acceso exclusivo del superadministrador

Los endpoints y pantallas de administración MUST estar disponibles solo para superadmin con MFA verificado.

#### Escenario: Administradora de condominio

- DADO una ADMINISTRADORA sin bandera de superadmin
- CUANDO llama a cualquier endpoint `/admin/*`
- ENTONCES responde 403 y no ve la sección en el menú

### Requisito: Condominios

El superadmin MUST poder listar todos los condominios y crear uno con razón social y NIT únicos.

#### Escenario: NIT repetido

- DADO un condominio con NIT 900123456-7
- CUANDO crea otro con el mismo NIT
- ENTONCES responde 409 con mensaje en español

### Requisito: Crear usuario con invitación

Al crear un usuario (nombre, email, roles opcionales por condominio) el sistema MUST crearlo sin contraseña, asignar los roles y enviar un correo con instrucciones de primer ingreso y un enlace para definir la contraseña válido 72 horas.

#### Escenario: Usuario nuevo con rol

- DADO el condominio A
- CUANDO el superadmin crea "Nora" con rol CONTADORA en A
- ENTONCES Nora existe, tiene membresía CONTADORA en A, recibe un correo con el enlace y los pasos (definir contraseña, ingresar, configurar verificación en dos pasos) y la respuesta indica `correoEnviado: true`

#### Escenario: Email ya registrado

- DADO un usuario con ese email
- CUANDO se intenta crear de nuevo
- ENTONCES responde 409 sin cambiar nada

#### Escenario: Falla el correo

- DADO el servidor de correo no disponible
- CUANDO se crea el usuario
- ENTONCES el usuario se crea igual y la respuesta indica `correoEnviado: false`

### Requisito: Gestión de roles

El superadmin MUST poder asignar un rol en cualquier condominio, cambiarlo y desactivarlo/reactivarlo; cada cambio MUST auditarse en el condominio con antes/después.

#### Escenario: Asignar rol

- DADO un usuario sin roles
- CUANDO se le asigna ADMINISTRADORA en A
- ENTONCES su próximo ingreso muestra A y exige MFA

### Requisito: Estado del usuario

El superadmin MUST poder desactivar y reactivar usuarios (no a sí mismo) y reenviar la invitación. Desactivar MUST cerrar sus sesiones.

#### Escenario: Desactivar

- DADO un usuario con sesión abierta
- CUANDO el superadmin lo desactiva
- ENTONCES su sesión deja de funcionar en la siguiente petición
