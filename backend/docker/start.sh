#!/bin/sh
set -e

attempt=0
until /app/node_modules/.bin/prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 12 ]; then
    echo "ERROR: prisma migrate deploy failed after $attempt attempts, giving up"
    exit 1
  fi
  echo "Migration attempt $attempt failed (postgres may not be ready), retrying in 5s..."
  sleep 5
done

exec node dist/main.js
