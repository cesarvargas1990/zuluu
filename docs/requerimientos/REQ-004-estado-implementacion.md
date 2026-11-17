# REQ-004 · Estado de implementación

Actualizado: 2026-11-16.

## Implementado en el checkout

- Esquema/migración para obligaciones, libro inmutable, ajustes, gestiones, compromisos e importaciones.
- API multi-tenant para consulta, registro de obligaciones/gestiones/compromisos, solicitud/resolución de ajustes, detalle e informes Excel/PDF.
- Integración al verificar recaudos: una imputación coincidente con obligación por unidad, concepto y periodo crea su movimiento de pago; el saldo se deriva del libro.
- Importación de saldos desde Excel/CSV con resumen previo, detección de unidades inválidas y aprobación explícita antes de crear cargos de saldo inicial.
- Página inicial de cartera con KPIs, antigüedad, búsqueda, filtros de periodo/estado/saldo y exportación Excel/PDF.
- Validación local: typecheck y lint correctos (se conservan advertencias preexistentes en otras pantallas), 80 pruebas unitarias API (152 en total entre API/web/shared) y 93 pruebas de integración; build de producción API/web correcto.

## Pendiente

- Validar visualmente la pantalla en navegador.
- Desplegar a producción y verificar URL pública y migración.
- La comprobación del tablero TodoTask no se hizo: la instrucción más reciente pidió omitir Chrome y trabajar solo desde la descripción copiada.
