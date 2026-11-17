# Especificación: cartera

## Requisitos

- La cartera calcula saldo por obligación desde cargo, pagos verificados, reversos y ajustes aprobados.
- Un recaudo pendiente u observado no afecta cartera. Su imputación crea movimiento solo al verificarse.
- Cada saldo se clasifica como corriente, 1–30, 31–60, 61–90 o más de 90 días; se identifica el estado pendiente, parcial, pagado o vencido.
- Gestiones y compromisos se consultan por unidad y no modifican el saldo.
- Los ajustes requieren motivo y aprobación por un usuario distinto del solicitante.
- Los listados y reportes se limitan al condominio activo y registran exportación.
- La consulta admite filtros por unidad/titular, periodo, estado y rango de deuda.
