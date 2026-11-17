#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$ZULU_APP_DB_PASSWORD" <<'SQL'
CREATE ROLE zulu_app LOGIN PASSWORD :'app_password';
SQL
