#!/bin/sh
set -e

PRISMA_BIN="/app/node_modules/.bin/prisma"
MAX_ATTEMPTS=12
RETRY_DELAY=5

echo "Starting database migrations..."

attempt=0
migration_status=1

while [ "$attempt" -lt "$MAX_ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  echo "Migration attempt $attempt/$MAX_ATTEMPTS: running 'prisma migrate deploy'..."

  if "$PRISMA_BIN" migrate deploy; then
    migration_status=0
    echo "Migrations applied successfully on attempt $attempt."
    break
  fi

  echo "Migration attempt $attempt/$MAX_ATTEMPTS failed (database may not be ready yet)."
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    echo "Retrying in ${RETRY_DELAY}s..."
    sleep "$RETRY_DELAY"
  fi
done

if [ "$migration_status" -ne 0 ]; then
  echo "ERROR: prisma migrate deploy failed after $attempt attempts, giving up."
  echo "ERROR: Refusing to start the application without a migrated database."
  exit 1
fi

echo "Database migrations completed. Starting application..."
exec node dist/main.js
