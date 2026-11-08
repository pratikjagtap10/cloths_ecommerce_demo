#!/bin/sh
# core-service container entrypoint.
# For the API server: apply database migrations, load demo data (first start only), then start.
# For core-worker (CMD "node dist/worker.js") it starts the command directly.
set -e

if [ "$2" = "dist/server.js" ]; then
  echo "Applying database migrations..."
  npx --no-install prisma migrate deploy

  if [ "${SEED_DEMO_DATA:-0}" = "1" ]; then
    node dist/seed.js
  fi
fi

exec "$@"
