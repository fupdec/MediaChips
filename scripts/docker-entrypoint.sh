#!/bin/sh
set -eu

PUID="${PUID:-1001}"
PGID="${PGID:-1001}"

DATA_DIR="${MEDIA_CHIPS_DATA_DIR:-/data}"
mkdir -p "$DATA_DIR" "$DATA_DIR/app_storage"

# Keep a predictable non-root user for Synology / NAS volume ownership.
if [ "$(id -u)" = "0" ]; then
  CURRENT_UID="$(id -u nodejs 2>/dev/null || echo "")"
  CURRENT_GID="$(id -g nodejs 2>/dev/null || echo "")"

  if [ "$CURRENT_GID" != "$PGID" ]; then
    groupmod -o -g "$PGID" nodejs 2>/dev/null || addgroup -g "$PGID" -S nodejs
  fi

  if [ "$CURRENT_UID" != "$PUID" ]; then
    usermod -o -u "$PUID" -g "$PGID" nodejs 2>/dev/null \
      || adduser -S -D -H -u "$PUID" -G nodejs nodejs
  fi

  chown -R nodejs:nodejs "$DATA_DIR" /app/app_storage 2>/dev/null || true
  exec su-exec nodejs "$@"
fi

exec "$@"
