#!/bin/sh
# Memories-Hub backup script
# Creates a timestamped backup of the database and media storage.
# Usage: ./scripts/backup.sh [backup-dir]

set -e
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

echo "[backup] Dumping database..."
docker compose exec -T postgres pg_dump \
    -U "${POSTGRES_USER:-mhub}" \
    "${POSTGRES_DB:-memorieshub}" \
    | gzip > "${BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"
echo "[backup] Database dump saved to ${BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"

echo "[backup] Archiving media storage..."
tar -czf "${BACKUP_DIR}/storage_${TIMESTAMP}.tar.gz" \
    -C "${MEDIA_STORAGE_PATH:-./storage}" .
echo "[backup] Media archive saved to ${BACKUP_DIR}/storage_${TIMESTAMP}.tar.gz"

echo "[backup] Done. Files:"
ls -lh "${BACKUP_DIR}" | grep "$TIMESTAMP"
