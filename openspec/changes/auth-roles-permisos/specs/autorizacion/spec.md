# Especificación: Autorización

## Propósito

Decidir qué puede hacer cada usuario por condominio, área, acción y expediente, denegando por defecto (§2, §9, §13).

## Requisitos

### Requisito: Contexto de condominio

Toda operación sobre datos de un condominio MUST indicar el condominio y MUST validarse contra una membresía activa del usuario.

#### Escenario: Sin membresía en el condominio

- DADO un usuario con membresía solo en el condominio A
- CUANDO consulta un recurso indicando el condominio B
- ENTONCES responde 404 sin revelar si el recurso existe

#### Escenario: Recurso de A pedido desde contexto B

- DADO un usuario con membresías en A y B, operando en B
- CUANDO pide por ID un recurso de A
- ENTONCES responde 404

### Requisito: Denegación por defecto

Una acción MUST permitirse solo si la matriz de su rol o una concesión explícita la autoriza, y ninguna restricción explícita la niega. Las restricciones MUST prevalecer sobre concesiones.

#### Escenario: Asistente no aprueba pagos (§13.1)

- DADO una ASISTENTE del condominio A
- CUANDO intenta `aprobar` en el área Finanzas y cartera
- ENTONCES responde 403

#### Escenario: Asistente sin acceso a jurídico restringido (§13.1)

- DADO una ASISTENTE sin concesión sobre el área Jurídica y convivencia
- CUANDO intenta `leer` un recurso de esa área
- ENTONCES responde 403

#### Escenario: Operaciones sin datos financieros

- DADO un usuario OPERACIONES
- CUANDO intenta `leer` en Finanzas y cartera
- ENTONCES responde 403

#### Escenario: Concesión explícita

- DADO una ASISTENTE con concesión `leer` en Contratos
- CUANDO lee un recurso de Contratos
- ENTONCES se permite

#### Escenario: Restricción por expediente

- DADO un ASESOR_JURIDICO con restricción `leer` sobre el expediente X
- CUANDO lee el expediente X
- ENTONCES responde 403 aunque su rol permita leer el área

### Requisito: Matriz de permisos por rol

El sistema SHALL definir permisos por defecto para cada rol en una fuente única compartida por API y web. CONSEJO MUST NOT tener acceso por defecto.

#### Escenario: Consejo sin acceso por defecto

- DADO un usuario CONSEJO sin concesiones
- CUANDO intenta `leer` cualquier área
- ENTONCES responde 403

### Requisito: Gestión de membresías y permisos

Solo ADMINISTRADORA del condominio o un superadministrador ZULU MAY crear, modificar o desactivar membresías, concesiones y restricciones de ese condominio.

#### Escenario: Asistente intenta otorgar permisos

- DADO una ASISTENTE
- CUANDO intenta crear una concesión
- ENTONCES responde 403

#### Escenario: Desactivación inmediata

- DADO una membresía desactivada
- CUANDO su usuario hace la siguiente petición en ese condominio
- ENTONCES responde 404 aunque su token siga vigente

### Requisito: Acceso excepcional de superadmin

Un superadministrador ZULU MUST NOT ver datos de un condominio sin un acceso excepcional vigente con justificación y vencimiento ≤ 8 h.

#### Escenario: Superadmin sin acceso excepcional

- DADO un superadministrador sin acceso excepcional en A
- CUANDO lee datos de A
- ENTONCES responde 403

#### Escenario: Acceso excepcional vigente

- DADO un acceso excepcional con justificación, vigente
- CUANDO lee datos de A
- ENTONCES se permite y queda auditado con la referencia al acceso

#### Escenario: Acceso vencido

- DADO un acceso excepcional vencido
- CUANDO lee datos de A
- ENTONCES responde 403
