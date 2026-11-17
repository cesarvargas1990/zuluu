# Propuesta: REQ-003 · Registro de pagos y recaudos

Fuente: `docs/requerimientos/REQ-003_ZULU_Pagos_Recaudos_TodoTask.docx` (v1.0, 2026-11-12) y mockup `REQ-003_Mockup_Interactivo.html`.

## Intención

Registrar los recaudos de forma trazable, asociados a una unidad privada y con su soporte, evitando imputaciones equivocadas y pagos duplicados. Hoy se llevan en archivos separados.

## Alcance

### Incluido

- Registro manual de pagos (fecha, valor, medio, referencia, banco, pagador, propietario, unidad, observación) con comprobante PDF/JPG/PNG.
- Consulta con búsqueda y filtros por propietario, unidad, fechas, estado y medio; indicadores.
- Verificación: estados pendiente → verificado / observado / anulado (con motivo).
- Imputación al verificar: conceptos y periodos, abonos parciales y excedente como saldo a favor.
- Pagos por identificar: sin unidad no se pueden verificar ni imputar.
- Advertencia de posibles duplicados (referencia, valor, fecha, unidad).
- Importación desde Excel con prevalidación; nada se crea hasta confirmar.
- Permisos por acción (área 02), auditoría de cada operación, exportación autorizada.

### Excluido

- Pasarela, conexión o conciliación bancaria automática.
- Intereses y cuentas de cobro. La cartera llegó con REQ-004: al verificar, cada imputación que coincide con una obligación de la unidad (concepto y periodo) reduce su saldo.
- Contabilidad y comprobantes tributarios.

## Módulos afectados

M02 Finanzas y cartera · `apps/api` (módulo `recaudos`, migración), `apps/web` (página `/recaudos`), `packages/shared` (matriz de permisos).

## Supuestos (preguntas abiertas del REQ, por validar con ZULU)

| #   | Pregunta                    | Supuesto implementado                                                                                |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | ¿Quién verifica?            | Quien tenga `aprobar` en área 02: CONTADORA y ADMINISTRADORA.                                        |
| 2   | Medios de pago              | Transferencia, consignación, efectivo, otro. Banco como texto libre.                                 |
| 3   | Orden de imputación         | Manual: quien verifica distribuye. Sin orden automático.                                             |
| 4   | Anticipos / varias unidades | Se admiten anticipos (saldo a favor). Un pago pertenece a una sola unidad.                           |
| 5   | Soporte                     | Opcional, PDF/JPG/PNG, máximo 10 MB.                                                                 |
| 7   | Importación masiva          | Incluida en esta entrega.                                                                            |
| —   | Asistente                   | Se amplía su permiso por defecto en área 02 de `crear` a `leer` + `crear` para que consulte (HU-01). |

## Riesgos

| Riesgo                                              | Mitigación                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| Supuestos de negocio distintos a lo que decida ZULU | Reglas concentradas en `recaudos.reglas.ts` y en la matriz de permisos   |
| Soportes en la base (bytea) aumentan su tamaño      | Límite de 10 MB; mismo patrón que documentos de propietarios             |
| Imputación sin cartera real                         | Texto explícito en pantalla; la integración definitiva llega con REQ-004 |

## Rollback

Migración solo aditiva (tablas y tipos nuevos). Revertir código y, si hiciera falta, eliminar las tablas `recaudo*` e `importacion_recaudos`; no toca datos existentes.

## Criterios de éxito

- [ ] CA-01 a CA-09 del REQ cubiertos por pruebas de integración.
- [ ] El condominio B no ve ni modifica recaudos del A.
- [ ] La asistente registra pero no verifica ni anula.
