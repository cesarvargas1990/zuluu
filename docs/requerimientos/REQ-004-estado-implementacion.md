# REQ-004 · Gestión de cartera · Estado de implementación

Actualizado: 2026-11-16. Requerimiento: `REQ-004_ZULU_Gestion_Cartera_TodoTask.docx` · mockup: `REQ-004_Mockups.html`.

## Qué hace

| Funcionalidad pedida                                   | Cómo quedó                                                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Cartera individual y general por propietario o unidad  | Pestaña «Resumen por unidad» y «Estado de cuenta» de cada villa o lote                                                                       |
| Obligaciones pendientes, pagadas, parciales y vencidas | Pestaña «Obligaciones»; el estado se muestra en texto junto con los días de mora                                                             |
| Saldos calculados automáticamente                      | Saldo = cargo + ajustes débito − pagos verificados (netos de reversos) − ajustes crédito, a partir del libro de movimientos (solo inserción) |
| Antigüedad                                             | Corriente, 1–30, 31–60, 61–90 y más de 90 días, a la **fecha de corte** elegida                                                              |
| Integración con REQ-003                                | Solo un pago **verificado** crea movimiento; al anularlo se registra el reverso. Los pendientes se muestran aparte                           |
| Gestiones, compromisos y seguimiento                   | Gestión con canal, contacto, resultado y próxima fecha; compromiso opcional; no cambian la deuda                                             |
| Historial financiero por unidad                        | Movimientos con saldo acumulado y trazabilidad de cada obligación                                                                            |
| Reportes Excel y PDF                                   | Cartera general, cartera vencida, estado de cuenta y gestiones; usan los mismos filtros y corte del listado                                  |
| Ajustes solo por autorizados                           | Se solicitan con motivo y soporte; los aprueba **otra persona**; la obligación original no cambia                                            |
| Filtros                                                | Propietario, unidad, periodo, estado y rango de deuda                                                                                        |
| Importación de saldos iniciales                        | Excel/CSV con validación fila por fila, control de duplicados y aprobación antes de crear                                                    |
| Generación de cuotas                                   | Crea la cuota de administración del periodo para las unidades activas con cuota mensual definida                                             |

## Permisos (área 02 Finanzas y cartera)

| Acción     | Qué permite                                                       | Roles por defecto                                     |
| ---------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `leer`     | Consultar cartera, estados de cuenta, gestiones y ajustes         | Administradora, contadora, asistente, asesor jurídico |
| `crear`    | Registrar gestiones y compromisos (no cambian saldos)             | Administradora, contadora, asistente                  |
| `editar`   | Registrar obligaciones, solicitar ajustes, preparar importaciones | Administradora, contadora                             |
| `aprobar`  | Resolver ajustes, aprobar importaciones, generar cuotas           | Administradora, contadora                             |
| `exportar` | Reportes Excel y PDF                                              | Administradora, contadora                             |

## Supuestos por validar con ZULU (preguntas abiertas del REQ)

1. **Autorización de ajustes**: cuatro ojos; quien solicita no puede aprobar (también forzado en la base de datos).
2. **Intereses de mora**: no se calculan (RN-11). Existe el concepto «Intereses» para registrarlos a mano.
3. **Orden de imputación**: al verificar un pago se proponen las obligaciones más antiguas primero; quien verifica puede cambiarlo.
4. **Saldo a favor**: se muestra separado por unidad. Aplicarlo a una obligación aún no está implementado (hoy se hace con un ajuste crédito autorizado).
5. **Conceptos y periodicidad**: cuota de administración mensual desde `cuota_mensual` de la unidad; extraordinarias, intereses y otros, a mano.
6. **Corte histórico**: el saldo a una fecha usa los movimientos hasta ese día; un pago anulado después deja su reverso con la fecha de anulación.

## Validación

- `pnpm typecheck` y `pnpm lint` sin errores.
- 169 pruebas unitarias (API 93, web 67, shared 9) y 114 de integración; `test/cartera.int.spec.ts` cubre CA-01 a CA-10, permisos y aislamiento A/B.
- Recorrido en navegador a 1440 y 375 px: resumen, obligaciones, estado de cuenta, gestión con compromiso, ajuste, importación y descarga de PDF/Excel.
- No se ejecutaron las pruebas E2E de Playwright.

## Historial

- `5babba9` — primera versión: modelo de datos, API básica, listado de obligaciones e importación.
- Revisión posterior — se completó lo que faltaba de la primera versión: fecha de corte, cartera por unidad, estado de cuenta, detalle y trazabilidad, pantalla de gestiones/compromisos/ajustes, generación de cuotas, control de duplicados en la importación, reportes de cartera vencida, estado de cuenta y gestiones, y PDF tabulado. Correcciones: la asistente ya no puede crear obligaciones; el reverso de un pago usa la fecha de Colombia (antes, de noche quedaba con la fecha del día siguiente); un saldo inicial importado ya se puede pagar desde recaudos.

## Despliegue

Ver «Producción» en `CLAUDE.md`. GitHub Actions no tiene secretos de despliegue: se despliega a mano por SSH.
