# Sidecar that periodically dumps Postgres and ships the dump offsite to
# S3-compatible storage (AWS S3, Backblaze B2, DigitalOcean Spaces, Cloudflare
# R2, MinIO, etc.). Runs as its own container so a bug in the API can't take
# backups down with it, and so backups happen even if nobody remembers to set
# up a host cron job.
FROM postgres:15-alpine
RUN apk add --no-cache aws-cli
COPY config/backup/backup.sh /backup.sh
RUN chmod +x /backup.sh
ENTRYPOINT ["/backup.sh"]
