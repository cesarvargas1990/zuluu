# Capacidad: Gestión documental y archivo inteligente

## Requisitos

### Requisito: Expedientes digitales
El sistema DEBE mantener expedientes separados por condominio y área, con nombre, asunto, responsable, estado y fechas. Responsable, propietario y unidad DEBEN seleccionarse de catálogos de la copropiedad y guardarse como relaciones a sus registros; un documento nuevo DEBE quedar asociado a un expediente.

### Requisito: Originales y versiones
El sistema DEBE preservar cada binario original, calcular SHA-256 y crear una versión nueva al sustituir un archivo; NUNCA sobrescribir ni borrar una versión probatoria mediante una operación ordinaria.

### Requisito: Búsqueda autorizada
El buscador DEBE consultar metadatos y contenido indexado, admitir filtros por área, expediente, fecha, radicado, propietario y unidad, y aplicar los permisos antes de devolver resultados. Una coincidencia restringida NO DEBE revelar que el documento existe.

### Requisito: Aislamiento de condominio
Toda entidad y archivo DEBE quedar aislado por condominio tanto en API como en PostgreSQL RLS. Un ID/URL válido de otro condominio NO DEBE permitir consulta o descarga.

### Requisito: Relaciones
El sistema DEBE vincular documentos con propietarios, unidades y registros existentes de módulos ZULU. Las relaciones NO DEBEN fusionar estados ni asumir que una entidad de un módulo futuro existe.

### Requisito: Auditoría
El sistema DEBE registrar carga, versionado, consulta sensible, descarga, exportación, cambios de metadatos y permisos, incluyendo actor, fecha y objeto.

### Requisito: Obligaciones y vencimientos
Una fecha extraída o sugerida NO DEBE generar un vencimiento válido ni tarea automática hasta revisión humana. La fecha documental, recepción y notificación DEBEN conservarse por separado.

### Requisito: Exportación
El sistema DEBE exportar solo expedientes autorizados con índice, metadatos, versiones seleccionadas e integridad de archivos verificable.

### Requisito: Respaldo y recuperación
La política DEBE cubrir metadatos y binarios, y una prueba de restauración DEBE confirmar que ambos pueden recuperarse y que sus checksums coinciden.
