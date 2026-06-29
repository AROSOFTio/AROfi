#!/bin/sh
# Dumps Postgres on a fixed interval, gzips it, and uploads it offsite if
# BACKUP_S3_BUCKET is configured. Runs forever in its own container instead of
# relying on a host cron job someone has to remember to set up.
set -eu

BACKUP_DIR=/backups
mkdir -p "$BACKUP_DIR"

run_backup() {
  timestamp="$(date -u +%Y%m%d_%H%M%S)"
  file="$BACKUP_DIR/arofi_${timestamp}.sql.gz"

  echo "[backup] $(date -u +%FT%TZ) starting dump -> $file"
  if ! PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$file"; then
    echo "[backup] ERROR: pg_dump failed" >&2
    rm -f "$file"
    return 1
  fi
  echo "[backup] wrote $file ($(du -h "$file" | cut -f1))"

  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    endpoint_flag=""
    [ -n "${BACKUP_S3_ENDPOINT:-}" ] && endpoint_flag="--endpoint-url ${BACKUP_S3_ENDPOINT}"
    if aws $endpoint_flag s3 cp "$file" "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-arofi}/$(basename "$file")"; then
      echo "[backup] uploaded to s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-arofi}/"
    else
      echo "[backup] ERROR: offsite upload failed, dump kept locally only" >&2
    fi
  else
    echo "[backup] WARNING: BACKUP_S3_BUCKET not set - backup is LOCAL ONLY, not offsite. Set BACKUP_S3_BUCKET to fix this." >&2
  fi

  find "$BACKUP_DIR" -name 'arofi_*.sql.gz' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
}

echo "[backup] starting backup loop: every ${BACKUP_INTERVAL_SECONDS:-86400}s, retaining ${BACKUP_RETENTION_DAYS:-14} days locally"
while true; do
  run_backup || echo "[backup] this cycle failed, will retry next interval" >&2
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
done
