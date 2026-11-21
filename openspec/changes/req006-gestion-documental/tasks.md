# Tareas REQ-006

## Definición y decisiones

- [x] 0.1 Revisar borrador, mockup y módulos/permisos/archivos existentes.
- [x] 0.2 Sin importación inicial; archivos nuevos en volumen privado de servidor, 25 MB máximo.
- [x] 0.3 Reutilizar roles, ACL por expediente y compartición explícita con Consejo/confidenciales.
- [x] 0.4 Volumen Docker privado y script de respaldo conjunto; falta programar y probar restore en servidor.
- [x] 0.5 Texto digital indexable ahora; OCR en fase posterior.

## Persistencia y seguridad

- [x] 1.1 Modelar expediente, documento, versiones inmutables, actuaciones y relaciones multitenant.
- [x] 1.2 Mantener documentos existentes en módulos fuente; no importar sin decisión posterior.
- [x] 1.3 Implementar ACL por tenant, área, expediente y compartición; RLS y grants mínimos.
- [x] 1.4 Implementar volumen privado, validación de firma, integridad/checksum y límite 25 MB.
- [x] 1.5 Auditar búsqueda, consulta, carga, descarga, exportación y cambios.
- [x] 1.6 Crear script de respaldo conjunto; restauración queda por validar en servidor.

## Funcionalidad

- [x] 2.1 Panel, estructura y expediente digital.
- [x] 2.2 Carga, validación, metadatos y control de versiones.
- [x] 2.3 Buscador de metadatos/texto PDF-DOCX-XLSX respetando ACL.
- [x] 2.4 Relaciones con propietarios, unidades, cartera, recaudos, cobros y ambiental.
- [x] 2.5 Cronología, obligaciones y alertas con fecha verificada.
- [x] 2.6 Exportación TAR.GZ con índice y checksum de versiones.
- [x] 2.7 Informes PDF individual y consolidado filtrados por permisos de exportación.

## Aceptación y despliegue

- [ ] 3.1 Aceptación funcional/permisos/RLS en entorno desplegado.
- [ ] 3.2 Verificar aislamiento entre dos condominios y perfiles con acceso restringido.
- [ ] 3.3 Probar restauración completa de metadatos y binarios en entorno aislado.
- [ ] 3.4 Validación de Gerencia ZULU y aceptación del piloto Majagua.
- [ ] 3.5 Despliegue y comprobación autenticada en el entorno acordado.
