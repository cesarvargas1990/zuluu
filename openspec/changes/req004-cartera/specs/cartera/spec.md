# Especificación: Cartera (REQ-004)

## Requisitos

### Requisito: Saldo por obligación

El saldo MUST calcularse como cargo + ajustes débito aprobados − pagos verificados (netos de reversos) − ajustes crédito aprobados, a partir de un libro de movimientos que solo admite inserciones.

#### Escenario: CA-01 detalle y saldo

- DADO dos obligaciones vigentes de una unidad
- CUANDO se consulta su estado de cuenta
- ENTONCES muestra cada obligación, sus movimientos y el saldo total correcto

#### Escenario: obligación repetida

- CUANDO se registra otra obligación del mismo concepto y periodo para la unidad
- ENTONCES responde 409 y no crea nada

### Requisito: Solo los pagos verificados afectan la cartera

#### Escenario: CA-02 pago pendiente

- DADO un pago pendiente de verificar
- ENTONCES el saldo no cambia y el pago se lista aparte como no verificado

#### Escenario: CA-03 y CA-06 pago verificado parcial

- CUANDO se verifica imputando $400.000 a una obligación de $550.000
- ENTONCES el saldo baja exactamente $400.000 y la obligación queda en pago parcial por $150.000

#### Escenario: CA-04 anulación

- CUANDO se anula el pago verificado
- ENTONCES se registra un reverso, el saldo se restituye y ambos movimientos quedan en el historial

### Requisito: Antigüedad a la fecha de corte

La mora MUST clasificarse en corriente, 1–30, 31–60, 61–90 y más de 90 días desde el vencimiento hasta la fecha de corte.

#### Escenario: CA-05 rangos

- DADO una obligación que vence el 10 de septiembre
- ENTONCES al corte del 10 es corriente, del 11 de septiembre al 10 de octubre 1–30, y así sucesivamente
- Y a un corte anterior a su emisión no aparece

### Requisito: Gestiones y compromisos

#### Escenario: CA-07 compromiso

- CUANDO la asistente registra una gestión con compromiso de pago
- ENTONCES queda registrada y el saldo de la unidad no cambia

### Requisito: Ajustes autorizados

Los ajustes MUST exigir motivo y ser resueltos por una persona distinta de quien los solicita. MUST NOT modificar ni borrar la obligación original.

#### Escenario: cuatro ojos

- CUANDO quien solicitó el ajuste intenta aprobarlo ENTONCES responde 403
- Y CUANDO lo aprueba otra persona con permiso ENTONCES se crea el movimiento y cambia el saldo

### Requisito: Importación de saldos iniciales

#### Escenario: CA-08 archivo con inconsistencias

- DADO un archivo con filas válidas, una unidad inexistente, una fila repetida y valores inválidos
- CUANDO se previsualiza ENTONCES indica fila y motivo, y no crea obligaciones
- Y CUANDO se aprueba ENTONCES solo crea las filas válidas; importar de nuevo no duplica

### Requisito: Reportes

#### Escenario: CA-10 reporte y listado coinciden

- DADO un filtro y una fecha de corte
- CUANDO se exporta la cartera general
- ENTONCES las filas, saldos y total del archivo coinciden con el listado, e indica la fecha de corte

### Requisito: Permisos y aislamiento

#### Escenario: HU-03 asistente

- ENTONCES consulta y registra gestiones, pero recibe 403 al crear obligaciones, solicitar o resolver ajustes, aprobar importaciones o exportar

#### Escenario: CA-09 otro condominio

- CUANDO una administradora del condominio B consulta, modifica o exporta la cartera del A
- ENTONCES los listados salen vacíos y las demás operaciones responden 404
