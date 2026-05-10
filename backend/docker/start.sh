#!/bin/sh
set -eu

/app/node_modules/.bin/prisma migrate deploy
exec node dist/main.js
