#!/bin/sh
set -eu

src=/home/cvargas/zuluu/cesarvargas.tech.nginx.new
dst=/etc/nginx/sites-available/cesarvargas.tech
expected=228d92c08d374cf49fd58fc231fbfdc837568a1701d1a604b6d925fcaaf638d0
actual=$(sha256sum "$dst" | awk '{print $1}')

if [ "$actual" != "$expected" ]; then
  echo "El vhost activo cambió desde la revisión; no se modificó: $actual" >&2
  exit 1
fi

backup="${dst}.bak.zulu.$(date +%Y%m%d%H%M%S)"
cp -a "$dst" "$backup"
install -o root -g root -m 0644 "$src" "$dst"

if ! nginx -t || ! systemctl reload nginx; then
  cp -a "$backup" "$dst"
  nginx -t
  systemctl reload nginx
  echo "Se restauró la configuración anterior desde $backup" >&2
  exit 1
fi

echo "ZULU activado en /zulu; respaldo: $backup"
