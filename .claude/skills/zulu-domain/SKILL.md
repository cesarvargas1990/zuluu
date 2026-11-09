---
name: zulu-domain
description: Reglas de negocio, glosario y criterios de aceptación de ZULU ADMIN (administración de condominios, Majagua). Usar antes de diseñar, especificar o implementar cualquier módulo M01–M10, cuando se hable de expedientes, cartera, PQRS, CVC/agua, auditoría, roles o permisos, o al escribir pruebas de aceptación.
---

# Dominio ZULU ADMIN

Fuente de verdad: `docs/requirements/especificaciones.md` (resumen) y el PDF en `docs/requirements/`. Léelos para el detalle; aquí van las reglas que no se pueden romper.

## Invariantes (nunca violar)

1. **Aislamiento por condominio.** Todo dato de un condominio lleva `condominio_id` y política RLS. Ninguna consulta de negocio se hace fuera de `prisma.withTenant(...)`. Ver skill `prisma-tenant-table`.
2. **Auditoría append-only.** Cambios sensibles (cartera, autorizaciones, exportaciones, accesos, borrados lógicos) generan fila en `auditoria` con actor, acción, objeto, antes/después, IP. El rol de app no puede UPDATE/DELETE en `auditoria`.
3. **Originales inmutables.** Un documento subido nunca se sobrescribe: nueva versión + SHA-256. Derivados (OCR, resumen) se guardan aparte e identificados.
4. **Dinero no se borra.** Movimientos financieros confirmados solo se corrigen con reverso/ajuste trazable. Montos en `Decimal` (`@db.Decimal(18,2)`), nunca `Float`. Moneda COP.
5. **Sin doble contabilización.** Una obligación puede vincularse a N documentos pero se contabiliza una vez (CU-05).
6. **Envíos con aprobación.** Cobros/comunicaciones masivas requieren control de calidad + aprobación; se guarda quién aprobó y la versión exacta enviada.
7. **Estados honestos.** "radicado" ≠ "aprobado"; "prórroga" ≠ "permiso aprobado". Estados de evidencia: recibido, pendiente_validar, validado, observado, sustituido, archivado.
8. **Humano en el circuito.** IA solo genera borradores que citan documento/página; decisiones jurídicas, financieras o sancionatorias requieren validación humana.
9. **Alertas con texto.** Semáforo rojo/naranja/amarillo/verde siempre acompañado de etiqueta textual (accesibilidad).
10. **Mínima información y datos reales.** Nunca usar datos reales de propietarios en seeds, fixtures, pruebas externas ni prompts de IA. Seeds con datos ficticios.

## Roles y permisos

Roles: `SUPERADMIN_ZULU, ADMINISTRADORA, ASISTENTE, CONTADORA, ASESOR_JURIDICO, OPERACIONES, CONSEJO` (enum Prisma `Rol` + `packages/shared/src/roles.ts`, mantener sincronizados).
Permiso = (condominio, área, acción, expediente?) con acciones `leer|crear|editar|aprobar|exportar|eliminar`. Denegar por defecto. Superadmin accede de forma excepcional **y auditada**.

## Glosario

- **Expediente**: carpeta lógica de un asunto (área, radicado, entidad, responsable, estado).
- **Radicado**: número de recibo de una entidad (p. ej. CVC); no implica aprobación.
- **CVC**: Corporación Autónoma Regional del Valle del Cauca (autoridad ambiental).
- **PTAP/PTAR**: planta de tratamiento de agua potable / residual.
- **PQRS**: peticiones, quejas, reclamos y sugerencias.
- **Coeficiente**: participación de la unidad privada en la copropiedad (Ley 675/2001).
- **Cartera**: saldos por cobrar de propietarios; mora por antigüedad.

## Pruebas de aceptación (§13)

Cada módulo que toque estos puntos debe incluir su prueba automatizada: aislamiento A/B por búsqueda/URL/API; asistente sin aprobar pagos; versiones de oficio; alertas con cómputo; bloqueo de envío con saldo inconsistente; saldo a favor sin duplicar; restauración de backup; exportación completa de expediente.

## Idioma

UI, mensajes de error y nombres de dominio (modelos, tablas, enums) en español. Infraestructura y código genérico pueden ir en inglés.
