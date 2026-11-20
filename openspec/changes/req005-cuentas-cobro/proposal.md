# REQ-005 · Cuentas de cobro

Implementar configuración de periodos y conceptos, generación individual/masiva de borradores desde la cartera REQ-004, revisión, aprobación, emisión de PDF privado con consecutivo, registro de envíos e historial. La generación nunca crea ni altera obligaciones financieras.

## Módulos afectados

- Finanzas/cartera (área 02): API y modelo de documentos.
- ZULU ADMIN web: tablero, configuración, vista previa, aprobación/emisión e historial.
- Packages: sin cambios previstos.

## Referencias

- REQ-005 §4-§11; CU de configuración, generación, revisión, emisión, distribución e historial.
- Dependencias REQ-001 a REQ-004, especialmente cartera conciliada y titularidad validada.

## Riesgo y reversión

Las cuentas son snapshots inmutables y no contabilizan; anular es lógico y trazable. Migración aditiva. Reversión: deshabilitar módulo y restaurar imagen/backup; conservar filas emitidas y no borrar PDFs históricos.
