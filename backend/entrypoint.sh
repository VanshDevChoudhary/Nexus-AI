#!/bin/sh
set -e

export PYTHONPATH=/app:$PYTHONPATH

echo "Waiting for postgres..."
until python -c "
import socket
try:
    socket.create_connection(('postgres', 5432), timeout=2)
    print('  connected!')
except Exception as e:
    print(f'  waiting... {e}')
    raise SystemExit(1)
" 2>/dev/null; do
  sleep 3
done

echo "Running migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
