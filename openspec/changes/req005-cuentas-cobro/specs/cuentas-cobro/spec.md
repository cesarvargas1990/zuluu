# Especificación: cuentas de cobro

## Periodos y conceptos

### Escenario: configurar un periodo

Dado que el usuario tiene permiso `02:editar` y no existe el periodo en la copropiedad activa
Cuando guarda periodo, corte, vencimiento y conceptos autorizados
Entonces el sistema SHALL persistir la configuración y auditarla sin crear obligaciones.

## Generación desde cartera

### Escenario: generar cuenta individual o lote

Dado un periodo configurado y obligaciones con sus movimientos registrados hasta el corte
Cuando el usuario genera para una unidad o para el lote
Entonces el sistema SHALL crear un snapshot por unidad con los saldos anteriores y actuales, excluir recaudos no verificados, indicar inconsistencias y evitar duplicados activos.

### Escenario: titularidad pendiente o pago por conciliar

Dado que la unidad no tiene titular validado o existe un recaudo pendiente al corte
Cuando se genera la cuenta
Entonces se marcará la observación y el sistema SHALL bloquear la aprobación hasta que se corrija la fuente financiera o de titularidad.

### Escenario: aislamiento entre copropiedades

Dado que una cuenta pertenece a la copropiedad A
Cuando un usuario de la copropiedad B solicita la cuenta, historial o PDF
Entonces el sistema SHALL responder sin revelar ni modificar el documento de A.

## Aprobación, emisión y conservación

### Escenario: emitir una cuenta aprobada

Dado que una cuenta no tiene observaciones y un usuario posee `02:aprobar`
Cuando la aprueba y luego la emite
Entonces el sistema SHALL asignar un consecutivo único, guardar el PDF privado y la versión enviada, y auditar el actor y los cambios.

### Escenario: evitar emisión duplicada

Dado que existe una cuenta activa para la misma unidad y periodo
Cuando se repite la generación
Entonces el sistema SHALL omitirla sin crear otro documento activo.

### Escenario: anular un documento

Dado un usuario con `02:aprobar`
Cuando anula una cuenta con una justificación válida
Entonces el sistema SHALL conservar el PDF, consecutivo e historial, registrar la justificación y permitir crear una cuenta sustituta trazable.

## Distribución

### Escenario: distribuir por correo

Dado un documento emitido y un correo validado de un titular vigente
Cuando el usuario solicita el envío
Entonces el sistema SHALL adjuntar el PDF, registrar el estado técnico de entrega y auditar el intento.

### Escenario: no afirmar entrega sin evidencia

Dado un envío manual o un error de transporte
Cuando se registra el resultado
Entonces el estado SHALL permanecer pendiente o fallido hasta contar con evidencia de aceptación por el transporte o confirmación de entrega.
