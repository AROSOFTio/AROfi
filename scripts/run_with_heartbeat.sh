#!/bin/sh
set -eu

label="${1:-build}"
shift

"$@" &
pid=$!

while kill -0 "$pid" 2>/dev/null; do
  echo "[heartbeat] ${label} is still running..."
  sleep 20
done

wait "$pid"
