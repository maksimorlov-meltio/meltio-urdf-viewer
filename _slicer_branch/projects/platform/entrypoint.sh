#!/bin/sh
# Apply migrations, then start the app. depends_on waits for Postgres to be
# healthy, but keep a short retry so a slow first boot doesn't crash-loop.
set -e

attempt=1
until alembic upgrade head; do
  if [ "$attempt" -ge 10 ]; then
    echo "alembic upgrade failed after $attempt attempts" >&2
    exit 1
  fi
  echo "migrations not ready (attempt $attempt) — retrying in 2s" >&2
  attempt=$((attempt + 1))
  sleep 2
done

exec uvicorn meltio_platform.web.app:create_app --factory --host 0.0.0.0 --port 8090
