#!/bin/sh
# shop-service container entrypoint: apply database migrations, then start the service.
set -e

if [ "$2" = "dist/server.js" ]; then
  echo "Applying database migrations..."
  npx --no-install prisma migrate deploy
fi

exec "$@"
