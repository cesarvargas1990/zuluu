# Tareas REQ-004

## 1. Infraestructura

- [x] 1.1 Modelos y migración `req004_cartera` (obligación, movimiento, ajuste, gestión, compromiso, importación) con RLS y grants
- [x] 1.2 Migración `req004_saldos_iniciales_historicos` (vencimientos anteriores a la emisión en importaciones)

## 2. API

- [x] 2.1 Reglas puras de saldo, mora y tramos con pruebas unitarias
- [x] 2.2 Pruebas de integración CA-01 a CA-10, permisos y aislamiento A/B
- [x] 2.3 Cartera por unidad y por obligación con fecha de corte y filtros
- [x] 2.4 Estado de cuenta y detalle de obligación con trazabilidad
- [x] 2.5 Obligaciones (registro y generación de cuotas), gestiones, compromisos y ajustes con cuatro ojos
- [x] 2.6 Importación de saldos iniciales con control de duplicados
- [x] 2.7 Reportes Excel y PDF (general, vencida, estado de cuenta, gestiones)
- [x] 2.8 Integración con recaudos: pago verificado y reverso al anular

## 3. Web

- [x] 3.1 Página `/cartera`: resumen, obligaciones, gestiones y compromisos, ajustes, importación y reportes
- [x] 3.2 Estado de cuenta y detalle de obligación
- [x] 3.3 Verificación de pagos propone las obligaciones abiertas de la unidad

## 4. Verificación

- [x] 4.1 Typecheck, lint, pruebas unitarias e integración, build
- [x] 4.2 Revisión visual en navegador (1440 y 375 px)
- [ ] 4.3 Pruebas E2E de Playwright
- [ ] 4.4 Validar supuestos con ZULU (ver `docs/requerimientos/REQ-004-estado-implementacion.md`)
