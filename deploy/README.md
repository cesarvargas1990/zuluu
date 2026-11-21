# Despliegue de producción

## Respaldo documental REQ-006

El repositorio privado reside en el volumen Docker `zulu_documentos`, montado en la API en `/var/lib/zulu/documentos`. Para respaldar juntos metadatos/binarios, ejecutar en el servidor:

```sh
cd /home/cvargas/zuluu
sh deploy/backup-zulu.sh
```

El script guarda el `pg_dump` y el archivo del volumen en `/home/cvargas/backups/zulu/`, restringe permisos locales, valida que ambos archivos se puedan listar y genera SHA-256. Se puede elegir otro destino con `ZULU_BACKUP_DIR`. El respaldo no sustituye una restauración de prueba: esa comprobación debe hacerse en un entorno aislado antes de depender de copias de producción.

Para restaurar, detener la API y la migración en el entorno aislado; restaurar el dump con `pg_restore --clean --if-exists -d "$DATABASE_URL" archivo.dump` como administrador de PostgreSQL y extraer el archivo documental en el volumen montado en `/var/lib/zulu/documentos`. Luego validar hashes y arrancar la API. No ejecutar sobre la base productiva sin procedimiento de cambio aprobado.

El servidor usa `/home/cvargas/zuluu`, conserva sus secretos en `.env` y publica `/zulu/api/v1/health` detrás del Nginx del host. No agregar secretos al repositorio.

Con SSH configurado para `cvargas@147.93.1.252`, desde el repositorio:

1. Crear respaldo reciente de PostgreSQL en `/home/cvargas/backups/zulu/`.
2. Sincronizar los archivos versionados al servidor, sin reemplazar `.env`.
3. En el servidor, desde `/home/cvargas/zuluu`, ejecutar:

   ```sh
   docker compose -f docker-compose.production.yml build db migrate api web
   docker compose -f docker-compose.production.yml up -d db
   docker compose -f docker-compose.production.yml run --rm migrate
   docker compose -f docker-compose.production.yml up -d --remove-orphans api web
   docker compose -f docker-compose.production.yml ps
   curl --fail --retry 12 --retry-delay 5 http://127.0.0.1:8301/zulu/api/v1/health
   ```

El despliegue automático de GitHub Actions requiere secretos de repositorio `ZULU_HOST`, `ZULU_SSH_USER`, `ZULU_SSH_KEY` y `ZULU_KNOWN_HOSTS`. El flujo no se ejecuta hasta configurarlos.
