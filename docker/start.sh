#!/bin/bash

set -e

echo "======================================"
echo " Starting MetrologyGuard"
echo "======================================"

mkdir -p /app/storage/uploads
mkdir -p /app/storage/reports

echo "Starting ML service..."

cd /app/ml-service

/opt/ml-venv/bin/uvicorn main:app \
    --host 127.0.0.1 \
    --port 8000 \
    > /tmp/ml-service.log 2>&1 &

ML_PID=$!

echo "ML service PID: $ML_PID"

echo "Waiting for ML service..."

for i in {1..60}; do
    if curl -fs http://127.0.0.1:8000/health > /tmp/ml-health.json 2>/dev/null; then
        echo "ML service is ready."
        cat /tmp/ml-health.json
        break
    fi

    sleep 2
done

echo "Starting API..."

cd /app

NODE_ENV=development \
API_PORT=4000 \
HOST=0.0.0.0 \
WEB_ORIGIN=http://localhost:7860 \
ML_SERVICE_URL=http://127.0.0.1:8000 \
DATABASE_PATH=/app/storage/metrologyguard.db \
STORAGE_PATH=/app/storage \
node /app/apps/api/dist/server.js \
> /tmp/api.log 2>&1 &

API_PID=$!

echo "API PID: $API_PID"

echo "Waiting for API..."

for i in {1..30}; do
    if curl -fs http://127.0.0.1:4000/api/health > /tmp/api-health.json 2>/dev/null; then
        echo "API is ready."
        cat /tmp/api-health.json
        break
    fi

    sleep 2
done

echo "Starting Nginx..."

nginx -g "daemon off;"
