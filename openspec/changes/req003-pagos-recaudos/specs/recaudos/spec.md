# Especificación: Recaudos (REQ-003)

## Requisitos

### Requisito: Registro de pago

El sistema MUST registrar un pago con fecha, valor mayor que cero (COP), medio y, opcionalmente, referencia, banco, pagador, propietario, unidad y observación. Todo pago nuevo MUST quedar en estado PENDIENTE con un número consecutivo por condominio y el usuario creador.

#### Escenario: CA-01 pago válido con soporte

- DADO una unidad existente
- CUANDO la asistente registra un pago válido y adjunta un PDF
- ENTONCES se crea PENDIENTE con número `RC-0001`, el soporte queda guardado con su SHA-256 y hay evento `recaudo.registrado`

#### Escenario: valor inválido

- CUANDO el valor es cero, negativo o tiene más de dos decimales
- ENTONCES responde 400 y no crea nada

### Requisito: Posibles duplicados

Al registrar, el sistema MUST advertir si existe un pago no anulado con el mismo valor y la misma referencia, o con el mismo valor, fecha y unidad. La coincidencia MUST exigir confirmación explícita.

#### Escenario: CA-02 duplicado

- DADO un pago con referencia TRX-1 por $580.000
- CUANDO se registra otro igual sin confirmar
- ENTONCES responde 409 con los pagos similares y no crea nada
- Y CUANDO se reenvía con `confirmarDuplicado`
- ENTONCES se crea marcado como posible duplicado

### Requisito: Pagos por identificar

Un pago sin unidad MUST quedar por identificar y MUST NOT poder verificarse ni imputarse hasta asignarle unidad.

#### Escenario: CA-03 pago sin unidad

- CUANDO se registra un pago sin unidad
- ENTONCES queda PENDIENTE, aparece en la bandeja por identificar y verificarlo responde 409
- Y CUANDO alguien con `editar` le asigna unidad
- ENTONCES sale de la bandeja y queda evento `recaudo.identificado`

### Requisito: Verificación e imputación

Solo quien tenga `aprobar` en área 02 MUST poder verificar, observar o anular. Al verificar se registran imputaciones (concepto, periodo, valor aplicado y, opcionalmente, valor de la obligación). La suma aplicada MUST NOT superar el valor del pago; el excedente queda como saldo a favor.

#### Escenario: CA-04 abono parcial

- DADO un pago de $300.000
- CUANDO se verifica aplicándolo a una obligación de $580.000
- ENTONCES queda VERIFICADO con saldo pendiente de $280.000 en esa obligación y saldo a favor $0

#### Escenario: CA-05 excedente

- DADO un pago de $700.000
- CUANDO se verifica aplicando $580.000
- ENTONCES el saldo a favor es $120.000 y no se duplica al consultar

#### Escenario: imputación mayor al pago

- CUANDO la suma aplicada supera el valor del pago
- ENTONCES responde 400 y el pago sigue PENDIENTE

### Requisito: Anulación sin borrado

Un pago MUST NOT eliminarse. La anulación MUST exigir motivo y conservar imputaciones, soporte e historial.

#### Escenario: CA-06 anular verificado

- DADO un pago verificado
- CUANDO se anula sin motivo ENTONCES responde 400
- Y CUANDO se anula con motivo ENTONCES queda ANULADO, con quién y cuándo, y evento `recaudo.anulado` con el estado anterior
- Y un pago anulado no admite más cambios

### Requisito: Permisos

#### Escenario: CA-07 usuario sin permisos

- DADO una ASISTENTE
- CUANDO intenta verificar, anular o modificar un pago
- ENTONCES responde 403 y el pago no cambia

### Requisito: Consulta y detalle

El listado MUST filtrar por texto, estado, medio, unidad, propietario y rango de fechas. El detalle MUST mostrar imputaciones, soportes e historial de auditoría.

#### Escenario: CA-09 detalle

- DADO un pago verificado con soporte
- CUANDO se consulta el detalle
- ENTONCES incluye imputaciones, metadatos del soporte y los eventos de auditoría con nombre del usuario

### Requisito: Soportes

Los soportes MUST ser PDF, JPG o PNG de hasta 10 MB, verificando el contenido real del archivo. La descarga MUST exigir permiso de lectura y quedar auditada.

#### Escenario: soporte inválido

- CUANDO se adjunta un archivo de otro tipo o con extensión falsa
- ENTONCES responde 400 "El archivo no cumple el formato o tamaño permitido."

### Requisito: Importación desde Excel

La previsualización MUST mostrar errores, advertencias y duplicados sin crear pagos. Solo al confirmar se crean, como PENDIENTE, las filas válidas.

#### Escenario: CA-08 archivo con filas erróneas

- DADO un archivo con una fila válida, una con valor inválido, una con unidad inexistente y una duplicada
- CUANDO se previsualiza
- ENTONCES muestra el resultado por fila y no existe ningún pago nuevo
- Y CUANDO se confirma
- ENTONCES solo se crea la fila válida

### Requisito: Aislamiento entre condominios

#### Escenario: condominio B no ve A

- DADO un pago del condominio A
- CUANDO una administradora de B lista, consulta, descarga el soporte, modifica, verifica o anula ese pago
- ENTONCES el listado no lo incluye y las demás operaciones responden 404
