#!/usr/bin/env bash

set -euo pipefail

network_name="lil-mappo-local"

if ! docker network inspect "$network_name" >/dev/null 2>&1; then
  docker network create \
    --driver bridge \
    --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 \
    "$network_name" >/dev/null
fi

exec supabase start --network-id "$network_name"
