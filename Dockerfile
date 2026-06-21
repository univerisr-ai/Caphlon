# =============================================================================
# Project Underdog - Dockerfile
# =============================================================================
# Build:  docker build -t project-underdog .
# Run:    docker run -p 8800:8800 project-underdog

FROM python:3.11-slim

LABEL org.opencontainers.image.title="Project Underdog"
LABEL org.opencontainers.image.description="Kovan Zekasi ile Merkeziyetsiz AI Gelistirme Sistemi"
LABEL org.opencontainers.image.version="0.2.0"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UNDERDOG_HOST=0.0.0.0
ENV UNDERDOG_PORT=8800

WORKDIR /app

COPY project_underdog/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

EXPOSE 8800

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8800/health').raise_for_status()"

ENTRYPOINT ["python", "-m", "project_underdog.main"]
CMD ["orchestrator"]
