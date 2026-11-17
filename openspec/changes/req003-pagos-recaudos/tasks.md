# Tareas: REQ-003 Recaudos

## 1. Infraestructura

- [x] 1.1 Modelos Prisma y migración `req003_recaudos` (tablas, RLS, grants)
- [x] 1.2 Matriz de permisos: ASISTENTE lee en área 02
- [x] 1.3 Limpieza de tablas nuevas en `test/helpers/entorno.ts`

## 2. API

- [x] 2.1 RED: `recaudos.reglas.spec.ts` (valores, fechas, imputación)
- [x] 2.2 GREEN: `recaudos.reglas.ts`
- [x] 2.3 RED: `test/recaudos.int.spec.ts` (CA-01 a CA-09, aislamiento)
- [x] 2.4 GREEN: módulo `src/recaudos/` (registro, consulta, soporte, verificación, anulación, importación, exportación)

## 3. Web

- [x] 3.1 Cliente `api/recaudos.ts`, ruta `/recaudos` y menú
- [x] 3.2 RED/GREEN: página `Recaudos` (listado, registro, detalle, por identificar, importación)

## 4. Verificación

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test` e integración
- [x] 4.2 Revisión visual en el navegador
