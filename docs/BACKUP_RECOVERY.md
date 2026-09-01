# AROFi Backup & Recovery

The Platform Owner dashboard exposes Backup & Recovery at `/admin/backups`.

## What is protected

- PostgreSQL application database in custom `pg_dump` format.
- Each managed backup is wrapped as an `.arobackup` tar.gz bundle containing `database.dump` and `manifest.json`.
- SHA-256 is verified before restore.
- The production deployment mounts the named Docker volume `arofi-managed-backups` at `/var/lib/arofi/backups`, so application-container replacement does not delete managed backups.
- Cloudflare R2/S3-compatible upload is optional. The dashboard clearly reports whether offsite storage is configured.

## Automatic backups

Defaults:

- interval: every 6 hours (`AROFI_BACKUP_INTERVAL_SECONDS=21600`)
- local retention: 30 days (`AROFI_BACKUP_RETENTION_DAYS=30`)
- enabled unless `AROFI_BACKUP_AUTOMATION_ENABLED=false`

Pre-restore snapshots are excluded from normal retention cleanup.

## Restore safety sequence

1. Require Platform Owner (`ALL`) permission.
2. Require exact confirmation text `RESTORE <backup-file-name>` and a reason.
3. Verify archive structure and SHA-256 checksum.
4. Create a fresh live pre-restore `.arobackup`.
5. Restore the selected archive into a temporary PostgreSQL database.
6. Verify the core AROFi tables and record counts in that temporary database.
7. Terminate database sessions only at the final swap point.
8. Rename the current database aside and rename the verified temporary database to the production database name.
9. Validate the new live database again.
10. If post-swap validation fails, automatically rename the previous database back into place.
11. Keep the previous database available for immediate manual rollback after a successful restore.
12. Write CRITICAL audit entries for successful or failed restore attempts.

The restore flow never calls `docker compose down`, deletes the PostgreSQL volume, restarts FreeRADIUS, or changes SSTP/PPP configuration.

## Cloudflare R2

A root-only `/root/arofi-backup.env` file can be used by the production deploy script. It is appended to the protected API environment snapshot and is never printed by the deployment workflow.

Supported variables:

```text
BACKUP_S3_BUCKET=
BACKUP_S3_PREFIX=arofi/production
BACKUP_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
BACKUP_S3_ACCESS_KEY_ID=
BACKUP_S3_SECRET_ACCESS_KEY=
BACKUP_S3_REGION=auto
```

Without those variables, managed local backups still work and the dashboard displays `Local only` instead of claiming offsite protection.
