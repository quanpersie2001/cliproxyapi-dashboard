#!/bin/sh
set -e

PRISMA_SCHEMA_PATH="./prisma/schema.prisma"
PRISMA_CLI="./node_modules/prisma/build/index.js"

run_prisma() {
  node "$PRISMA_CLI" "$@" --schema "$PRISMA_SCHEMA_PATH"
}

echo "[dashboard] Applying Prisma migrations..."
run_prisma migrate deploy
echo "[dashboard] Prisma migrations applied"

echo "[dashboard] Starting server..."
exec node server.js
