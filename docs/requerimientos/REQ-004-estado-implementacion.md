# REQ-004 · Estado de implementación

Actualizado: 2026-11-16 (despliegue a producción comprobado el 2026-11-16, hora Colombia).

## Implementado en el checkout

- Esquema/migración para obligaciones, libro inmutable, ajustes, gestiones, compromisos e importaciones.
- API multi-tenant para consulta, registro de obligaciones/gestiones/compromisos, solicitud/resolución de ajustes, detalle e informes Excel/PDF.
- Integración al verificar recaudos: una imputación coincidente con obligación por unidad, concepto y periodo crea su movimiento de pago; el saldo se deriva del libro.
- Importación de saldos desde Excel/CSV con resumen previo, detección de unidades inválidas y aprobación explícita antes de crear cargos de saldo inicial.
- Página inicial de cartera con KPIs, antigüedad, búsqueda, filtros de periodo/estado/saldo y exportación Excel/PDF.
- Validación local: typecheck y lint correctos (se conservan advertencias preexistentes en otras pantallas), 80 pruebas unitarias API (152 en total entre API/web/shared) y 93 pruebas de integración; build de producción API/web correcto.
- Despliegue: commit `5babba9` publicado en `origin/main`; respaldo PostgreSQL creado en `/home/cvargas/backups/zulu/zulu-pre-req004-20261116.dump`; migraciones aplicadas y API/web recreados.
- Producción verificada: `/zulu/api/v1/health` devolvió HTTP 200 con base `up`; `/zulu/cartera` devolvió HTTP 200. Sin errores de arranque recientes en el contenedor API.

## Pendiente

- Validar visualmente la pantalla en navegador (omitido por la instrucción de no abrir Chrome).
- La comprobación del tablero TodoTask no se hizo: la instrucción más reciente pidió omitir Chrome y trabajar solo desde la descripción copiada.
- GitHub Actions no tiene secretos de despliegue configurados; este despliegue se hizo manualmente por SSH.
