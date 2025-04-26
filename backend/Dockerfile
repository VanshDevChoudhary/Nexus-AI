FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src/__init__.py ./src/__init__.py
RUN pip install --no-cache-dir -e ".[dev]"

COPY . .
RUN chmod +x entrypoint.sh

RUN useradd -m appuser
USER appuser

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
