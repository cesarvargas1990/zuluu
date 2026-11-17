# Despliegue de producción

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
