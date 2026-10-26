#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "Applying database migrations..."
    alembic upgrade head
fi

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
    if [ "${ENVIRONMENT:-development}" = "production" ]; then
        echo "Refusing to seed demo data in production."
    else
        echo "Ensuring demo data exists..."
        python -m scripts.seed_dev --with-images
    fi
fi

exec "$@"
