# ZULU ADMIN · Majagua Digital — Especificaciones (resumen operativo)

Fuente: `Especificaciones_Tecnicas_ZULU_ADMIN_MAJAGUA_DIGITAL.pdf` v1.0 (6 nov 2026). Ante duda, el PDF manda.
Cliente: ZULU Servicios Integrales S.A.S. Piloto: Majagua Villa Campestre (Calima El Darién, Valle del Cauca).

## 1. Principios

- Expediente digital trazable por copropiedad, separación estricta entre clientes (multi-tenant).
- Trabajo simultáneo con perfiles/autorizaciones independientes.
- Toda actuación: responsable, fecha, documento soporte, vencimiento, estado, evidencia de cierre.
- Bajo costo, mantenible, crecer a múltiples condominios.
- Originales inmutables, sin alteraciones silenciosas, respaldo cifrado en nube + dispositivo externo.

## 2. Perfiles

| Perfil                           | Acceso mínimo                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Superadministrador ZULU          | Configura condominios y roles; acceso excepcional y auditado                        |
| Administradora                   | Gestiona expedientes, aprueba flujos, informes, comunicaciones, tareas              |
| Asistente                        | Carga documentos, PQRS, tareas, comunicaciones; sin datos sensibles ni aprobaciones |
| Contadora                        | Cartera, conciliaciones, facturación, soportes; limitado por condominio             |
| Asesor jurídico                  | Casos, contratos, cartera prejurídica/jurídica asignada                             |
| Operaciones/mantenimiento        | Órdenes, inventario, evidencias técnicas; sin datos financieros                     |
| Consejo/propietarios (posterior) | Informes aprobados, estado de solicitudes, datos propios                            |

Permisos por **condominio, área, acción y expediente** (leer, crear, editar, aprobar, exportar, eliminar). Consejo sin acceso indiscriminado por defecto.

## 3. Módulos

| Cód | Módulo                  | Funciones                                                                                    | Prio |
| --- | ----------------------- | -------------------------------------------------------------------------------------------- | ---- |
| M01 | Archivo y expedientes   | Carpetas, etiquetas, búsqueda, versiones, OCR opcional, cronología, anexos, vínculo a tareas | P0   |
| M02 | Gobierno corporativo    | Actas, convocatorias, decisiones, compromisos, quórum, calendario                            | P1   |
| M03 | Cartera y recaudo       | Inmuebles, saldos, antigüedad de mora, ajustes auditados, acuerdos de pago, conciliación     | P0   |
| M04 | Finanzas y gastos       | Facturas, compras, aprobaciones, presupuestos, soportes, exportación contable                | P0   |
| M05 | Jurídico y convivencia  | Reglamentos, reformas, contratos, casos, requerimientos, debido proceso, vencimientos        | P0   |
| M06 | PQRS y comunicaciones   | Radicación, clasificación, respuestas, historial, tiempos                                    | P1   |
| M07 | Mantenimiento y activos | Inventario, inspecciones, órdenes, cotizaciones, fotos, costos                               | P1   |
| M08 | Ambiental y agua        | Concesión, cauce, PTAP, PTAR, vertimientos, radicados CVC, cronologías                       | P0   |
| M09 | Vigilancia y accesos    | Contratos, novedades, controles; visitantes con retención definida                           | P2   |
| M10 | Informes y tableros     | Semáforo, indicadores, alertas, PDF/Excel, seguimiento al Consejo                            | P0   |

## 4. Casos de uso piloto

- CU-01 Factura → proveedor, fecha, valor, área, centro de costo, soporte; consecutivo + flujo de aprobación.
- CU-02 Cuentas de cobro → detectar inconsistencias, exigir conciliación antes de envío masivo; conservar versión enviada.
- CU-03 Mora por inmueble y antigüedad → gestión de cobro, avisos revisados por humano.
- CU-04 Expediente CVC → radicado, requerimientos, prórrogas, notificaciones, obligaciones, documentos, alertas.
- CU-05 Crédito ambiental $2.599.606 vinculado a vertimientos y control financiero sin duplicar ingreso ni gasto.
- CU-06 Manual de convivencia 2018 y escritura PH 2018 como documentos distintos, con aprobación/reformas por verificar.
- CU-07 PQRS de propietario → responsable, plazo, respuesta, evidencia de cierre.
- CU-08 Informe al Consejo → hallazgos, soporte, riesgo, decisión solicitada, responsables.

## 5. Estructura documental

- Ruta lógica (virtual): ZULU ADMIN / Condominio / Área / Expediente / Año / Tipo de documento. No depende de carpetas del SO.
- Áreas 01–10: Administración; Finanzas y cartera; Contratos; Jurídica y convivencia; Infraestructura; Ambiental y agua; Seguridad; PQRS; Consejo y asambleas; Personal y proveedores.
- Subexpedientes de agua: concesión; cauce/bocatoma; acueducto y PTAP; PTAR y vertimientos; costos CVC; informes y cronologías.
- Metadatos obligatorios: ID, condominio, área, expediente, tipo, título, fecha documental, fecha de carga, origen, responsable, confidencialidad, estado, archivo.
- Original inmutable + derivaciones identificadas (OCR, versión corregida, resumen); SHA-256, versiones, registro de descargas.
- Estados de evidencia: recibido, pendiente de validar, validado, observado, sustituido, archivado. **"Radicado" ≠ "aprobado".**

## 6. Modelo de datos mínimo

Condominio · Unidad privada (coeficiente, titulares e historial) · Persona/tercero (tratamiento de datos) · Documento (versión, hash, ruta segura) · Expediente (área, radicado, entidad) · Tarea/obligación (fecha límite, dependencia, evidencia) · Movimiento financiero (cargo, abono, soporte, conciliación) · PQRS/caso jurídico · Auditoría (actor, fecha, acción, objeto, antes/después, IP).

## 7. Reglas críticas de negocio

- No enviar cobros sin control de calidad y aprobación; registrar quién autorizó y qué versión se envió.
- No eliminar movimientos financieros confirmados: reversos o ajustes trazables.
- Una obligación puede vincularse a varios documentos pero no contabilizarse varias veces.
- Una prórroga no implica aprobación; vencimientos según notificación real y calendario aplicable.
- Alertas: rojo urgente, naranja riesgo, amarillo en trámite, verde cerrado con soporte; configurables y **con texto** (no solo color).
- IA solo como borrador: debe citar documento/página y exigir validación humana en decisiones jurídicas, financieras o sancionatorias.
- Reglamentos: distinguir fecha del documento, vigencia comprobada, aprobación, reformas.

## 8. Arquitectura sugerida

Web responsiva en español; API REST con autenticación, autorización por rol y condominio, validación de entradas, procesos asíncronos para documentos. PostgreSQL con aislamiento por tenant. Almacenamiento de objetos privado, cifrado, URLs temporales. Búsqueda texto completo; OCR si se justifica. Notificaciones correo + tablero interno con colas y reintentos. Monolito modular para MVP.

## 9. Seguridad y privacidad

MFA para perfiles privilegiados · aislamiento multicliente probado · TLS + cifrado en reposo · secretos fuera del código, rotación · bitácora inalterable (accesos, exportaciones, cartera, autorizaciones, borrados lógicos) · backups cifrados con prueba de restauración, copia USB cifrada · mínima información · Ley 1581/2012 (datos personales), Ley 675/2001 (PH) · OWASP Top 10, control de subida de archivos, antivirus, fuerza bruta, CSRF/XSS/SQLi.

## 10. Flujos

- A. Ingreso de documentos: cargar → validar formato/tamaño → clasificar condominio/área → metadatos → hash → responsable → verificar → relacionar expediente → alertar si crea obligación → archivar original.
- B. Requerimiento de autoridad: radicar → fecha oficio y notificación → requisitos con referencia → plazo con responsable → tareas → respuesta → radicado de salida → verificar → cerrar con evidencia.
- C. Cuenta de cobro: importar saldos → conciliar bancos y auxiliares → revisar diferencias → aprobación contable/administrativa → generar → previsualizar → enviar → registrar entrega/rebotes → reclamaciones.
- D. PQRS: recibir → número de caso → categoría → asignación → acuse → investigación → respuesta revisada → comunicación → seguimiento → cierre documentado.

## 11. No funcionales

Disponibilidad ≥ 99,5 % · búsqueda/ficha ≤ 3 s p95 · ≥ 5 condominios sin rediseño · usable en Windows/navegadores actuales · teclado y estados no solo por color · RPO 24 h / RTO 8 h · exportación CSV/XLSX + documentos con metadatos · 100 % cambios sensibles auditados · sin vulnerabilidades críticas/altas al pasar a producción.

## 12. Fases

0 Descubrimiento (1–2 sem) · 1 MVP documental (3–5): usuarios/roles, condominios, expedientes, cargas, búsqueda, tareas, alertas, respaldos, auditoría · 2 Finanzas y gestión (4–6): cartera, conciliación, gastos, PQRS, contratos, informes · 3 Especialización (3–5): ambiental/agua, mantenimiento, Consejo, plantillas jurídicas · 4 Piloto (2–3).

## 13. Pruebas de aceptación obligatorias

1. Asistente no puede aprobar pagos ni ver expedientes jurídicos restringidos.
2. Usuario del condominio B no recupera documentos del A por búsqueda, URL ni API.
3. Dos versiones de un oficio: ambas se conservan y queda claro cuál es la vigente.
4. Alerta por vencimiento conserva fecha de notificación, cómputo y evidencia.
5. Cartera de prueba con saldo inconsistente → se bloquea envío hasta aprobación.
6. Saldo a favor de autoridad relacionado con un cobro sin duplicación contable.
7. Restauración de backup en ambiente aislado con integridad de documentos comprobada.
8. Exportación del expediente completo: archivos, metadatos, cronología y bitácora.

## 16. Decisiones abiertas

MVP solo interno o también portal de propietarios · volúmenes (inmuebles, usuarios, documentos, movimientos) · contabilidad integrada o auxiliar · correo masivo/WhatsApp (consentimiento, proveedor) · documentos públicos para Consejo · quién aprueba presupuesto, pruebas, migración y salida a producción.
Recomendación: primero MVP de archivo seguro + expedientes + tareas/alertas + cartera controlada. Nada de automatizar sanciones, cobros jurídicos o decisiones ambientales sin revisión humana.
