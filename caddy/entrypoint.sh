#!/bin/sh

set -eu

# Split host and port from a URL (backwards compatibility).
export FRONTEND_DOMAIN=${FRONTEND_DOMAIN:-${FRONTEND_HOST%:*}}
export FRONTEND_PORT=${FRONTEND_PORT:-${FRONTEND_HOST##*:}}

export BACKEND_DOMAIN=${BACKEND_DOMAIN:-${BACKEND_HOST%:*}}
export BACKEND_PORT=${BACKEND_PORT:-${BACKEND_HOST##*:}}

# Strip scheme from domain.
FRONTEND_DOMAIN=${FRONTEND_DOMAIN##*://}
BACKEND_DOMAIN=${BACKEND_DOMAIN##*://}

echo using frontend: ${FRONTEND_DOMAIN} with port: ${FRONTEND_PORT}
echo using backend: ${BACKEND_DOMAIN} with port: ${BACKEND_PORT}

exec caddy run --config Caddyfile --adapter caddyfile 2>&1