# AROFi FreeRADIUS server image — the production deployment unit for the
# docker-compose "freeradius" service. Bakes the AROFi config into the image
# (no host bind mounts; Coolify converts relative file mounts to directories
# and breaks them) and reuses the same entrypoint the standalone
# scripts/deploy-freeradius.sh path uses.
FROM freeradius/freeradius-server:3.2.5-alpine

USER root
COPY config/freeradius /arofi-freeradius
RUN chmod +x /arofi-freeradius/entrypoint.sh \
  && apk add --no-cache postgresql-libs

ENTRYPOINT ["/bin/sh", "/arofi-freeradius/entrypoint.sh"]
