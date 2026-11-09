# Especificación: Gestión de membresías (web)

## Propósito

Que la administradora del condominio controle quién accede y con qué permisos, sin soporte técnico (§2).

## Requisitos

### Requisito: Visibilidad

La sección "Personas y permisos" MUST mostrarse solo a ADMINISTRADORA del condominio activo (la vista de superadmin llega con la consola de superadmin).

#### Escenario: Asistente

- DADO una asistente
- CUANDO navega por la app o abre la URL directa
- ENTONCES no ve el enlace y la URL muestra "No tiene acceso a esta sección"

### Requisito: Listado

El listado MUST mostrar nombre, email, rol y estado (Activa/Inactiva como texto) de cada membresía y sus permisos explícitos.

#### Escenario: Listado del condominio

- DADO una administradora en el condominio A
- CUANDO abre la sección
- ENTONCES ve solo las membresías de A

### Requisito: Agregar persona

#### Escenario: Persona nueva

- DADO el formulario con nombre, email y rol
- CUANDO lo envía
- ENTONCES la persona aparece en el listado y se informa que recibirá un correo para definir su contraseña

#### Escenario: Datos inválidos

- DADO un email inválido
- CUANDO envía
- ENTONCES ve el error junto al campo

### Requisito: Cambiar rol y estado

Desactivar MUST pedir confirmación que nombre a la persona.

#### Escenario: Desactivar

- DADO una membresía activa
- CUANDO elige "Desactivar" y confirma
- ENTONCES el estado pasa a "Inactiva" y puede reactivarse

#### Escenario: Cancelar desactivación

- DADO el diálogo de confirmación
- CUANDO pulsa "Cancelar" o Escape
- ENTONCES nada cambia y el foco vuelve al botón original

### Requisito: Permisos explícitos

La pantalla MUST mostrar los permisos efectivos del rol por área (desde la matriz compartida) y permitir conceder o restringir una acción por área, opcionalmente para un expediente, y revocar permisos explícitos.

#### Escenario: Conceder lectura de Jurídica a una asistente

- DADO una asistente sin acceso a Jurídica
- CUANDO la administradora concede "Leer" en "04 Jurídica y convivencia"
- ENTONCES el permiso aparece como "Concedido" y los efectivos de esa área incluyen "Leer"

#### Escenario: Revocar

- DADO un permiso explícito
- CUANDO lo revoca y confirma
- ENTONCES desaparece del listado

### Requisito: Errores del API

#### Escenario: Sesión sin permiso o recurso inexistente

- DADO el API responde 403 o 404
- CUANDO se ejecuta una acción
- ENTONCES se muestra un mensaje en español y la lista se recarga
