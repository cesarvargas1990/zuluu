# Especificación: Gestión ambiental y aguas

## Requisitos

### Seis expedientes separados

El sistema MUST mostrar exactamente AG-001 a AG-006 como fichas independientes. Cada una MUST mantener su propia cronología, estados jurídicos/técnicos, radicados, documentos, obligaciones, responsables y finanzas. Un vínculo entre fichas MUST NOT cambiar el estado de ninguna.

#### Escenario: abrir permiso de vertimientos

- GIVEN los seis expedientes inicializados
- WHEN el usuario abre AG-005
- THEN solo ve actuaciones y anexos de AG-005 junto a vínculos explícitos a otros expedientes

### Fechas límite validadas

El sistema MUST NOT calcular una fecha de vencimiento legal por su cuenta. Solo emitirá alertas de fecha cuando una persona autorizada haya verificado notificación, fecha límite y método/plazo.

#### Escenario: prórroga sin plazo verificado

- GIVEN una solicitud de prórroga sin respuesta o notificación comprobada
- WHEN se registra la actuación
- THEN su estado queda pendiente de verificación y no se genera un vencimiento estimado

### Documentos

El sistema MUST preservar el archivo original, guardar su SHA-256 y servirlo solo dentro del tenant autenticado.
Un documento MUST mantener un expediente principal, y MAY relacionarse desde otros expedientes mediante vínculos explícitos sin duplicar el original.

#### Escenario: plano PTAR

- GIVEN cuatro planos no adjuntados aún
- WHEN se cargan como documentos técnicos en AG-004
- THEN quedan pendientes de validación y el estado del proceso no cambia a aprobado

#### Escenario: vincular un original a dos procesos

- GIVEN un documento original del expediente AG-004
- WHEN un usuario lo relaciona con AG-002
- THEN el archivo sigue teniendo expediente principal AG-004 y se puede consultar desde AG-002 sin duplicar sus bytes

### Finanzas

El sistema MUST distinguir saldo a favor de ingreso recibido y evitar registrar automáticamente dos veces la misma partida en tesorería.

#### Escenario: conciliar saldo CVC

- GIVEN un crédito preliminar de $2.599.606
- WHEN se crea como saldo a favor pendiente de conciliación
- THEN se informa como pendiente y no crea movimiento de tesorería/cartera

### Informes y aislamiento

El sistema MUST exportar PDF individual y consolidado. Cada tabla MUST cumplir RLS y cada endpoint MUST validar permisos de área.

#### Escenario: tenant distinto

- GIVEN procesos pertenecientes al condominio A
- WHEN un usuario del condominio B consulta o intenta vincularlos
- THEN no obtiene datos de A ni puede crear la relación

#### Escenario: especialista con permiso asignado a un expediente

- GIVEN una persona con permiso de lectura solo sobre AG-005
- WHEN abre el panel y consulta un expediente
- THEN el buscador solo lista AG-005 y una URL directa a AG-001 queda denegada

#### Escenario: estado jurídico sin permiso de aprobación

- GIVEN una persona con permiso de edición, pero sin aprobación
- WHEN intenta cambiar el estado jurídico a aprobado
- THEN el cambio es rechazado y el estado permanece igual
