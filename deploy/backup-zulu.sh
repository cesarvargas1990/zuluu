#!/bin/sh
set -eu
umask 077

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_DIR=${ZULU_BACKUP_DIR:-/home/cvargas/backups/zulu}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"
cd "$ROOT_DIR"

docker compose -f docker-compose.production.yml exec -T db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U zulu_owner -d zulu_admin -Fc' \
  > "$BACKUP_DIR/zulu-$STAMP.dump"
docker compose -f docker-compose.production.yml exec -T api \
  tar -czf - -C /var/lib/zulu/documentos . \
  > "$BACKUP_DIR/zulu-documentos-$STAMP.tar.gz"

docker compose -f docker-compose.production.yml exec -T db pg_restore --list \
  < "$BACKUP_DIR/zulu-$STAMP.dump" >/dev/null
tar -tzf "$BACKUP_DIR/zulu-documentos-$STAMP.tar.gz" >/dev/null
sha256sum "$BACKUP_DIR/zulu-$STAMP.dump" "$BACKUP_DIR/zulu-documentos-$STAMP.tar.gz" \
  > "$BACKUP_DIR/zulu-$STAMP.sha256"
printf 'Respaldo verificado: %s\n' "$STAMP"
