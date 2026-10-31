#!/bin/sh
set -eu
GATEWAY_TOKEN="$(cat /run/secrets/gateway_token)"
export GATEWAY_TOKEN
exec /docker-entrypoint.sh nginx -g 'daemon off;'
