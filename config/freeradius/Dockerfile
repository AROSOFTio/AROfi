# AROFi FreeRADIUS server image — the production deployment unit for the
# docker-compose "freeradius" service. Bakes the AROFi config into the image
# (no host bind mounts; Coolify converts relative file mounts to directories
# and breaks them) and reuses the same entrypoint the standalone
# scripts/deploy-freeradius.sh path uses.
# Pinned to 3.2.3 (pre-BlastRADIUS). 3.2.5 adds a Message-Authenticator to
# EVERY Access-Accept unconditionally, which the SSTP server's old pppd RADIUS
# client (libfreeradius-client) cannot validate ("invalid reply digest") — so
# remote-access SSTP tunnels loop "failed to authenticate ourselves" even
# though the credential is correct (verified: FreeRADIUS returns Access-Accept).
# 3.2.3 only echoes the request's Message-Authenticator, which the authorize
# rule already strips for router-* logins, so pppd is happy. Standard hotspot
# PAP auth is unchanged between 3.2.3 and 3.2.5.
FROM freeradius/freeradius-server:3.2.3-alpine

USER root
COPY config/freeradius /arofi-freeradius
RUN chmod +x /arofi-freeradius/entrypoint.sh \
  && apk add --no-cache postgresql-libs

ENTRYPOINT ["/bin/sh", "/arofi-freeradius/entrypoint.sh"]
