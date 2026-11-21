# REQ-006 · Gestión documental y archivo inteligente

Crear un repositorio documental multitenant para Majagua que organice expedientes y documentos por área, permita búsqueda autorizada, conserve originales y versiones, y relacione evidencia con propietarios, unidades y procesos existentes. El diseño debe poder reutilizarse en otros condominios.

## Alcance

- Expedientes digitales por copropiedad y área, con título, asunto, responsables, estado y cronología.
- Carga de PDF, DOC/DOCX, XLS/XLSX e imágenes; metadatos, hash SHA-256, versiones inmutables y estado de revisión (25 MB máximo por archivo).
- Búsqueda por texto extraíble en PDF, DOCX y Excel, metadatos, radicado, área, propietario, villa, fecha y proceso, aplicando permisos antes de devolver resultados.
- Relaciones con propietarios, unidades, recaudos, cartera, cuentas de cobro y procesos ambientales que existen en ZULU.
- Permisos por rol, usuario y expediente; auditoría de consulta sensible, descarga, exportación y cambios.
- Exportación TAR.GZ de expediente con índice y versiones; respaldo conjunto de PostgreSQL y volumen documental.
- Informes PDF por expediente y consolidados, limitados a registros que el usuario puede exportar.
- Almacenamiento privado persistente del servidor en el volumen Docker `zulu_documentos`.

## Fuera del alcance inicial

- OCR de imágenes escaneadas, interpretación legal, clasificación o cómputo de plazos sin revisión humana.
- Firma digital, publicación automática para Consejo/propietarios o borrado definitivo ordinario.
- Integraciones que apunten a módulos que aún no existen (p. ej. contratos o expedientes jurídicos completos); se preparará un vínculo extensible sin inventar registros.
- Importación masiva hasta confirmar fuente, volumen, estructura y autoridad de importación.

## Decisiones acordadas

- Almacenamiento de archivos en volumen privado del servidor; despliegue posterior.
- Sin importación de documentos existentes en esta etapa.
- Reutilizar roles existentes y ACL por expediente; Consejo requiere compartir explícito.
- Extraer texto PDF, DOCX y XLSX ahora; OCR en fase posterior.

## Dependencias y límites conocidos

- REQ-001 autenticación/permisos; REQ-002 propietarios/unidades; REQ-003 recaudos; REQ-004 cartera; REQ-005 cuentas de cobro; REQ-007 ambiental.
- Los documentos legados siguen en sus módulos de origen hasta definir su incorporación; no se duplican bytes en este alcance inicial.
- `deploy/backup-zulu.sh` respalda metadatos y volumen documental; frecuencia programada y prueba de restauración en servidor pendientes.

## Aprobación

El documento fuente v1.0 está en borrador y la aprobación de Gerencia ZULU figura pendiente. El usuario autorizó desarrollar esta versión con las decisiones indicadas arriba.
