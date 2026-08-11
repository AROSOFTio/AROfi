#!/bin/sh
# Targeted redeploy for one service in the existing Coolify Compose project.
#
# Run this on the Coolify server from a checkout of the commit to deploy:
#   AROFI_COOLIFY_APPLICATION_ID=5 ./scripts/deploy_coolify_component.sh api
#
# Unlike the Coolify Compose Deploy button, this keeps unrelated containers
# running. It builds only the requested Dockerfile.components target, replaces
# that one service, waits for it to become healthy, and reloads Nginx so its
# upstream DNS is refreshed. A failed health check recreates the previous image.

set -eu

application_id=${AROFI_COOLIFY_APPLICATION_ID:-}
component=${1:-}

if [ -z "$application_id" ] || [ -z "$component" ]; then
  echo "Usage: AROFI_COOLIFY_APPLICATION_ID=<id> $0 <api|admin|portal|nginx>" >&2
  exit 64
fi

case "$component" in
  api) target=api-runtime ;;
  admin) target=admin-runtime ;;
  portal) target=portal-runtime ;;
  nginx) target=nginx-runtime ;;
  *)
    echo "Unsupported component: $component" >&2
    exit 64
    ;;
esac

project_container_ids=$(docker ps -q --filter "label=coolify.applicationId=$application_id")
set -- $project_container_ids
if [ "$#" -lt 1 ]; then
  echo "Could not find a live container for Coolify application $application_id." >&2
  exit 1
fi
project_container=$1

project=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$project_container")
old_container_ids=$(docker ps -q \
  --filter "label=com.docker.compose.project=$project" \
  --filter "label=com.docker.compose.service=$component")
if [ -z "$old_container_ids" ]; then
  old_container_ids=$project_container
fi
set -- $old_container_ids
old_container=$1

compose_file=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$old_container")
environment_file=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.environment_file" }}' "$old_container")
previous_image=$(docker inspect -f '{{ .Config.Image }}' "$old_container")
live_networks=$(docker inspect -f '{{range $network, $_ := .NetworkSettings.Networks}}{{println $network}}{{end}}' "$old_container")

case "$component" in
  api) network_aliases="api arofi-api-v2" ;;
  admin) network_aliases="admin arofi-admin-v2" ;;
  portal) network_aliases="portal arofi-portal-v2" ;;
  nginx) network_aliases="nginx arofi-nginx-v2" ;;
esac

if [ ! -f "$compose_file" ]; then
  compose_file="$PWD/docker-compose.yaml"
  echo "[fast-deploy] Coolify cleaned its old Compose artifact; using $compose_file."
fi
if [ ! -f "$compose_file" ]; then
  echo "No Compose file is available for the live Coolify project." >&2
  exit 1
fi

revision=$(git rev-parse --short=12 HEAD)
image="arofi-$component:$revision"
override_file=$(mktemp /tmp/arofi-component-override-XXXXXX.yml)
generated_environment_file=
trap 'rm -f "$override_file" "$generated_environment_file"' EXIT HUP INT TERM

needs_generated_environment=0
if [ ! -f "$environment_file" ]; then
  needs_generated_environment=1
elif ! grep -q '^POSTGRES_PASSWORD=' "$environment_file" || \
     ! grep -q '^JWT_SECRET=.\+' "$environment_file" || \
     ! grep -q '^RADIUS_SHARED_SECRET=.\+' "$environment_file" || \
     ! grep -q '^ROUTER_CREDENTIAL_SECRET=.\+' "$environment_file" || \
     ! grep -q '^POSTGRES_PASSWORD=.\+' "$environment_file"; then
  needs_generated_environment=1
fi

if [ "$needs_generated_environment" -eq 1 ]; then
  generated_environment_file=$(mktemp /tmp/arofi-component-environment-XXXXXX.env)
  docker ps -q --filter "label=com.docker.compose.project=$project" | while read -r container_id; do
    docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container_id"
  done | awk -F= '
    NF == 0 { next }
    {
      key = $1
      value = substr($0, length(key) + 2)
      if (!(key in seen) || (seen[key] == "" && value != "")) {
        seen[key] = value
      }
    }
    END {
      for (key in seen) {
        print key "=" seen[key]
      }
    }
  ' > "$generated_environment_file"
  environment_file=$generated_environment_file
  echo "[fast-deploy] Reconstructed the Compose environment from the running services."
fi

write_override() {
  selected_image=$1
  printf 'services:\n  %s:\n    image: %s\n' "$component" "$selected_image" > "$override_file"
}

compose_up() {
  docker compose \
    --project-name "$project" \
    --project-directory "$(dirname "$compose_file")" \
    --env-file "$environment_file" \
    -f "$compose_file" \
    -f "$override_file" \
    up --detach --no-deps --no-build "$component"
}

attach_live_networks() {
  current_ids=$(docker compose \
    --project-name "$project" \
    --project-directory "$(dirname "$compose_file")" \
    --env-file "$environment_file" \
    -f "$compose_file" \
    -f "$override_file" \
    ps -q "$component")
  set -- $current_ids
  if [ "$#" -ne 1 ]; then
    echo "Could not identify the replacement $component container." >&2
    return 1
  fi
  replacement_container=$1

  for network in $live_networks; do
    if docker inspect -f '{{range $network, $_ := .NetworkSettings.Networks}}{{println $network}}{{end}}' "$replacement_container" | grep -Fxq "$network"; then
      continue
    fi
    alias_args=
    for alias in $network_aliases; do
      alias_args="$alias_args --alias $alias"
    done
    echo "[fast-deploy] Attaching $component to existing network $network."
    docker network connect $alias_args "$network" "$replacement_container"
  done
}

detach_new_networks() {
  current_ids=$(docker compose \
    --project-name "$project" \
    --project-directory "$(dirname "$compose_file")" \
    --env-file "$environment_file" \
    -f "$compose_file" \
    -f "$override_file" \
    ps -q "$component")
  set -- $current_ids
  if [ "$#" -ne 1 ]; then
    return 1
  fi
  replacement_container=$1

  docker inspect -f '{{range $network, $_ := .NetworkSettings.Networks}}{{println $network}}{{end}}' "$replacement_container" | while read -r network; do
    [ -n "$network" ] || continue
    if printf '%s\n' "$live_networks" | grep -Fxq "$network"; then
      continue
    fi
    echo "[fast-deploy] Removing temporary Compose network $network from $component."
    docker network disconnect "$network" "$replacement_container"
    docker network rm "$network" >/dev/null 2>&1 || true
  done
}

reload_nginx() {
  [ "$component" = nginx ] && return 0

  nginx_ids=$(docker ps -q \
    --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.service=nginx")
  set -- $nginx_ids
  if [ "$#" -ne 1 ]; then
    echo "Could not find the live Nginx container to refresh upstream DNS." >&2
    return 1
  fi
  docker exec "$1" nginx -s reload
}

wait_for_health() {
  attempts=0
  while [ "$attempts" -lt 36 ]; do
    current_ids=$(docker compose \
      --project-name "$project" \
      --project-directory "$(dirname "$compose_file")" \
      --env-file "$environment_file" \
      -f "$compose_file" \
      -f "$override_file" \
      ps -q "$component")
    set -- $current_ids
    if [ "$#" -eq 1 ]; then
      state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1")
      if [ "$state" = healthy ]; then
        return 0
      fi
      if [ "$state" = unhealthy ] || [ "$state" = exited ] || [ "$state" = dead ]; then
        return 1
      fi
    fi
    attempts=$((attempts + 1))
    sleep 5
  done
  return 1
}

echo "[fast-deploy] Building $component only from $revision..."
DOCKER_BUILDKIT=1 docker build --progress=plain \
  --target "$target" \
  --tag "$image" \
  --file Dockerfile.components \
  .

echo "[fast-deploy] Replacing only $component..."
write_override "$image"
compose_up
attach_live_networks
detach_new_networks

if wait_for_health; then
  reload_nginx
  echo "[fast-deploy] $component is healthy on $image."
  exit 0
fi

echo "[fast-deploy] $component did not become healthy; restoring $previous_image." >&2
write_override "$previous_image"
compose_up
attach_live_networks || true
detach_new_networks || true
wait_for_health || true
reload_nginx || true
exit 1
