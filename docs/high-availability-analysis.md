# Анализ High-Availability: Open Wearables

## 1. Текущая оценка Uptime

| Параметр                   | Текущее состояние                                       |
| -------------------------- | ------------------------------------------------------- |
| **Архитектура**            | Monolith (FastAPI) + Celery + PostgreSQL + Redis        |
| **Реплики сервисов**       | Все по 1 экземпляру (single instance)                   |
| **Load Balancer**          | Отсутствует                                             |
| **Failover БД**            | Отсутствует                                             |
| **Backup**                 | Отсутствует                                             |
| **Circuit Breakers**       | Отсутствуют                                             |
| **Мониторинг**             | Sentry (опционально), Flower, `/db` healthcheck         |
| **Оценка текущего uptime** | **~99.0–99.5%** (от 44 мин до 7.3 часов downtime/месяц) |

**До 99.95% (≤ 21.9 мин downtime/месяц) — значительный разрыв.**

---

## 2. Single Points of Failure (SPOF) — полный аудит

### 2.1 Таблица SPOF

| #   | Компонент                               | Вероятность сбоя | Влияние                     | Как проявится                                                                    |
| --- | --------------------------------------- | ---------------- | --------------------------- | -------------------------------------------------------------------------------- |
| 1   | **PostgreSQL (1 экземпляр)**            | Средняя          | **Полный downtime**         | API возвращает 500, данные не пишутся/читаются, дашборд пустой                   |
| 2   | **Redis (1 экземпляр)**                 | Средняя          | **Полный downtime**         | Celery не принимает/отдаёт задачи, синхронизация встаёт, sleep-tracking ломается |
| 3   | **FastAPI app (1 экземпляр)**           | Средняя          | **Полный downtime**         | SDK получает connection refused, дашборд недоступен, 0 API                       |
| 4   | **Celery Worker (1 экземпляр)**         | Средняя          | **Деградация**              | SDK-данные принимаются, но не обрабатываются; backlog растёт в Redis             |
| 5   | **Celery Beat (1 экземпляр)**           | Низкая           | **Деградация**              | Периодическая синхронизация провайдеров (Garmin и др.) прекращается              |
| 6   | **Docker Host (1 машина)**              | Низкая           | **Полный downtime**         | Вся система недоступна                                                           |
| 7   | **Отсутствие reverse proxy**            | —                | **Деградация**              | Нет TLS-терминации, нет rate limiting, нет graceful failover                     |
| 8   | **Отсутствие бэкапов PostgreSQL**       | —                | **Потеря данных**           | При краше диска — безвозвратная потеря всех медицинских данных                   |
| 9   | **Внешние API (Garmin, Polar, Strava)** | Высокая          | **1 провайдер**             | Данные конкретного провайдера не синхронизируются                                |
| 10  | **DNS / Сеть**                          | Низкая           | **Полный downtime**         | SDK не может достучаться до сервера                                              |
| 11  | **Docker volumes (локальные)**          | Низкая           | **Потеря данных**           | При сбое диска — потеря postgres_data и redis_data                               |
| 12  | **Нет таймаутов на Celery tasks**       | Средняя          | **Деградация**              | Зависшая задача блокирует worker-поток навсегда                                  |
| 13  | **Нет rate limiting на API**            | Средняя          | **Полный downtime**         | DDoS или ошибка в SDK (бесконечный retry) кладёт сервер                          |
| 14  | **Redis без пароля и healthcheck**      | Средняя          | **Безопасность + downtime** | Несанкционированный доступ; нет автообнаружения падения                          |

### 2.2 Карта критичности

```
                    КРИТИЧНОСТЬ ВЛИЯНИЯ
                    Полный ↑
                downtime │  [1] PostgreSQL    [2] Redis     [3] FastAPI
                         │  [6] Docker Host   [13] No Rate Limit
                         │
           Деградация    │  [4] Celery Worker [12] No Timeouts
                         │  [5] Celery Beat   [7] No Proxy
                         │
              1 агент    │  [9] Внешние API
                         │
           Потеря данных │  [8] Нет бэкапов  [11] Локальные volumes
                         └────────────────────────────────────────────▶
                           Низкая          Средняя          Высокая
                                    ВЕРОЯТНОСТЬ СБОЯ
```

---

## 3. Меры для достижения 99.99%+ (≤ 4.3 мин downtime/месяц)

### 3.1 Уровень 1 — PostgreSQL HA

**Текущее:** 1 экземпляр, нет реплик, нет бэкапов.

**Решение:** Patroni + Streaming Replication (или managed: AWS RDS Multi-AZ / Cloud SQL HA).

```yaml
# docker-compose.ha.yml — PostgreSQL с Patroni
services:
  pg-primary:
    image: postgres:18
    environment:
      POSTGRES_DB: open-wearables
      POSTGRES_USER: open-wearables
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_INITDB_ARGS: "--data-checksums"
    volumes:
      - pg_primary_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U open-wearables"]
      interval: 5s
      timeout: 3s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2.0"
    restart: always

  pg-replica:
    image: postgres:18
    environment:
      PGUSER: replicator
      PGPASSWORD: ${REPLICATION_PASSWORD}
    volumes:
      - pg_replica_data:/var/lib/postgresql/data
    depends_on:
      pg-primary:
        condition: service_healthy
    restart: always

  pgbouncer:
    image: edoburu/pgbouncer:1.23.0
    environment:
      DATABASE_URL: "postgres://open-wearables:${DB_PASSWORD}@pg-primary:5432/open-wearables"
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 200
      DEFAULT_POOL_SIZE: 25
      MIN_POOL_SIZE: 5
      RESERVE_POOL_SIZE: 5
      RESERVE_POOL_TIMEOUT: 3
    ports:
      - "6432:6432"
    healthcheck:
      test: ["CMD", "pg_isready", "-h", "localhost", "-p", "6432"]
      interval: 5s
      timeout: 3s
      retries: 3
    restart: always
    depends_on:
      pg-primary:
        condition: service_healthy
```

**Бэкапы PostgreSQL (WAL-G):**

```bash
#!/bin/bash
# scripts/backup/pg_backup.sh — запускать через cron каждые 6 часов
set -euo pipefail

export WALG_S3_PREFIX="s3://open-wearables-backups/postgres"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"
export PGHOST="pg-primary"
export PGUSER="open-wearables"
export PGPASSWORD="${DB_PASSWORD}"

# Full backup
wal-g backup-push /var/lib/postgresql/data

# Retain last 7 full backups
wal-g delete retain FULL 7 --confirm

echo "[$(date -Iseconds)] Backup completed successfully"
```

### 3.2 Уровень 2 — Redis HA

**Решение:** Redis Sentinel (минимум 3 узла) или Redis Cluster.

```yaml
# Redis Sentinel конфигурация
services:
  redis-master:
    image: redis:8
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 5s
      timeout: 3s
      retries: 3
    volumes:
      - redis_master_data:/data
    restart: always

  redis-replica:
    image: redis:8
    command: >
      redis-server
      --replicaof redis-master 6379
      --requirepass ${REDIS_PASSWORD}
      --masterauth ${REDIS_PASSWORD}
      --appendonly yes
    depends_on:
      redis-master:
        condition: service_healthy
    restart: always

  redis-sentinel:
    image: redis:8
    command: >
      redis-sentinel /etc/redis/sentinel.conf
    volumes:
      - ./config/sentinel.conf:/etc/redis/sentinel.conf
    depends_on:
      - redis-master
      - redis-replica
    restart: always
```

```conf
# config/sentinel.conf
sentinel monitor mymaster redis-master 6379 2
sentinel auth-pass mymaster ${REDIS_PASSWORD}
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 10000
sentinel parallel-syncs mymaster 1
```

### 3.3 Уровень 3 — FastAPI + Reverse Proxy

**Решение:** Nginx как reverse proxy + несколько FastAPI реплик.

```nginx
# config/nginx.conf
upstream fastapi_backend {
    least_conn;
    server app-1:8000 max_fails=3 fail_timeout=10s;
    server app-2:8000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 80;
    listen 443 ssl http2;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=sync:10m rate=10r/s;

    # Health check endpoint (не проксируется)
    location /nginx-health {
        return 200 "OK";
    }

    # SDK sync endpoint — отдельный rate limit
    location /api/v1/sdk/ {
        limit_req zone=sync burst=20 nodelay;
        proxy_pass http://fastapi_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
    }

    # Общий API
    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://fastapi_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_connect_timeout 5s;
        proxy_read_timeout 15s;
    }

    # Frontend — static
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

```yaml
# docker-compose.ha.yml — масштабирование app
services:
  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./config/ssl:/etc/nginx/ssl:ro
    depends_on:
      - app-1
      - app-2
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/nginx-health"]
      interval: 10s
      timeout: 3s
      retries: 3
    restart: always

  app-1:
    <<: *app-base
    container_name: app-1__open-wearables

  app-2:
    <<: *app-base
    container_name: app-2__open-wearables
```

### 3.4 Уровень 4 — Circuit Breakers + Timeouts

**Решение:** `circuitbreaker` + `httpx` timeouts для внешних API.

```python
# backend/app/utils/resilience.py
import functools
import logging
from circuitbreaker import circuit, CircuitBreakerError
from httpx import AsyncClient, Timeout

logger = logging.getLogger(__name__)

# Таймауты для httpx
EXTERNAL_API_TIMEOUT = Timeout(
    connect=5.0,
    read=15.0,
    write=10.0,
    pool=5.0,
)

# Circuit breaker для каждого провайдера
def provider_circuit(provider_name: str):
    """Circuit breaker: открывается после 5 ошибок за 60 секунд,
    восстанавливается через 30 секунд."""
    return circuit(
        failure_threshold=5,
        recovery_timeout=30,
        expected_exception=Exception,
        name=f"provider_{provider_name}",
    )


# Пример использования в провайдере Garmin
class GarminProvider:
    def __init__(self):
        self.client = AsyncClient(timeout=EXTERNAL_API_TIMEOUT)

    @provider_circuit("garmin")
    async def fetch_activities(self, user_id: str, start: str, end: str):
        response = await self.client.get(
            f"https://apis.garmin.com/wellness-api/rest/activities",
            params={"uploadStartTimeInSeconds": start, "uploadEndTimeInSeconds": end},
            headers=self._auth_headers(user_id),
        )
        response.raise_for_status()
        return response.json()
```

**Таймауты для Celery tasks:**

```python
# backend/app/integrations/celery/core.py — добавить в конфиг
app.conf.update(
    task_time_limit=300,           # Hard kill через 5 минут
    task_soft_time_limit=240,      # SoftTimeLimitExceeded через 4 минуты
    worker_max_tasks_per_child=500, # Перезапуск worker после 500 задач (утечки памяти)
    worker_prefetch_multiplier=4,  # Не забирать слишком много задач
    task_acks_late=True,           # ACK после выполнения (не потерять при краше)
    worker_cancel_long_running_tasks_on_connection_loss=True,
)
```

### 3.5 Уровень 5 — Мониторинг и Alerting

```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus:v3.2
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports:
      - "9090:9090"
    restart: always

  grafana:
    image: grafana/grafana:11.5
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
    restart: always

  alertmanager:
    image: prom/alertmanager:v0.28
    volumes:
      - ./config/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    restart: always

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:v0.16
    environment:
      DATA_SOURCE_NAME: "postgresql://open-wearables:${DB_PASSWORD}@pgbouncer:6432/open-wearables?sslmode=disable"
    restart: always

  redis-exporter:
    image: oliver006/redis_exporter:v1.66
    environment:
      REDIS_ADDR: "redis-master:6379"
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    restart: always
```

```yaml
# config/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/alerts.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'fastapi'
    metrics_path: /metrics
    static_configs:
      - targets: ['app-1:8000', 'app-2:8000']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:9113']
```

```yaml
# config/alerts.yml
groups:
  - name: critical
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.job }} is DOWN"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate > 5% on {{ $labels.instance }}"

      - alert: DatabaseConnectionPoolExhausted
        expr: pg_stat_activity_count / pg_settings_max_connections > 0.85
        for: 1m
        labels:
          severity: warning

      - alert: CeleryQueueBacklog
        expr: celery_queue_length{queue="sdk_sync"} > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "SDK sync queue backlog: {{ $value }} tasks"

      - alert: DiskSpaceWarning
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.15
        for: 5m
        labels:
          severity: warning
```

### 3.6 FastAPI Prometheus Metrics

```python
# backend/app/utils/metrics.py
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from starlette.requests import Request
from starlette.responses import Response
import time

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

ACTIVE_CONNECTIONS = Gauge(
    "http_active_connections",
    "Currently active HTTP connections",
)

SDK_SYNC_RECORDS = Counter(
    "sdk_sync_records_total",
    "Total records synced via SDK",
    ["provider", "record_type"],
)


async def metrics_middleware(request: Request, call_next):
    ACTIVE_CONNECTIONS.inc()
    start = time.perf_counter()
    try:
        response = await call_next(request)
        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code,
        ).inc()
        return response
    finally:
        duration = time.perf_counter() - start
        REQUEST_LATENCY.labels(
            method=request.method,
            endpoint=request.url.path,
        ).observe(duration)
        ACTIVE_CONNECTIONS.dec()


async def metrics_endpoint(request: Request) -> Response:
    return Response(generate_latest(), media_type="text/plain")
```

---

## 4. Чек-лист внедрения

| Приоритет | Мера                                                     | Сложность | Downtime при внедрении  | Эффект на uptime      |
| --------- | -------------------------------------------------------- | --------- | ----------------------- | --------------------- |
| **P1**    | `restart: always` на все сервисы в docker-compose        | Trivial   | 0                       | +0.3%                 |
| **P1**    | Healthcheck на Redis                                     | Trivial   | 0                       | +0.1%                 |
| **P1**    | Resource limits (memory/CPU) на все контейнеры           | Low       | 0                       | +0.2%                 |
| **P1**    | `task_time_limit` + `task_acks_late` в Celery            | Low       | ~1 мин (restart worker) | +0.2%                 |
| **P1**    | Автоматический бэкап PostgreSQL (WAL-G / pg_dump + cron) | Medium    | 0                       | Защита данных         |
| **P2**    | Nginx reverse proxy + TLS + rate limiting                | Medium    | ~5 мин                  | +0.3%                 |
| **P2**    | 2 реплики FastAPI app за Nginx                           | Medium    | ~5 мин                  | +0.5%                 |
| **P2**    | Circuit breaker на внешние API                           | Medium    | 0                       | +0.1%                 |
| **P2**    | Prometheus + Grafana + Alertmanager                      | Medium    | 0                       | Обнаружение проблем   |
| **P2**    | HTTP таймауты на все исходящие запросы                   | Low       | 0                       | +0.1%                 |
| **P3**    | PostgreSQL streaming replication (primary + replica)     | High      | ~15 мин                 | +0.3%                 |
| **P3**    | PgBouncer connection pooler                              | Medium    | ~5 мин                  | +0.1%                 |
| **P3**    | Redis Sentinel (3 узла)                                  | High      | ~10 мин                 | +0.2%                 |
| **P3**    | 2 Celery workers (отдельные процессы)                    | Low       | ~1 мин                  | +0.1%                 |
| **P4**    | Kubernetes / Docker Swarm (автоскейлинг, self-healing)   | Very High | ~1 час                  | +0.2%                 |
| **P4**    | Distributed tracing (OpenTelemetry)                      | Medium    | 0                       | Диагностика           |
| **P4**    | Chaos engineering (Litmus / Chaos Monkey)                | High      | 0                       | Проверка устойчивости |
| **P5**    | Multi-region deployment + Global Load Balancer           | Very High | ~4 часа                 | +0.05%                |
| **P5**    | Warm standby в другом ЦОД                                | Very High | ~1 день                 | DR                    |

---

## 5. Быстрые P1-исправления для текущего docker-compose

Эти изменения можно внести прямо сейчас без переархитектуры:

```yaml
# docker-compose.yml — минимальные изменения для P1
services:
  db:
    # ... существующее ...
    restart: always                    # было: не указано
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2.0"
    shm_size: 256mb                   # Для PostgreSQL temp_buffers

  redis:
    # ... существующее ...
    restart: always                    # было: не указано
    command: >
      redis-server
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    healthcheck:                       # было: отсутствует
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M

  app:
    # ... существующее ...
    restart: always                    # было: on-failure
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "1.5"

  celery-worker:
    # ... существующее ...
    restart: always                    # было: не указано
    deploy:
      resources:
        limits:
          memory: 1G

  celery-beat:
    # ... существующее ...
    restart: always                    # было: не указано
    deploy:
      resources:
        limits:
          memory: 256M

  frontend:
    # ... существующее ...
    restart: always                    # было: on-failure
```

---

## 6. Реалистичная оценка достижимых «девяток»

| Сценарий              | Меры                                             | Uptime            | Downtime/месяц    | Бюджет (инфра/мес.)  |
| --------------------- | ------------------------------------------------ | ----------------- | ----------------- | -------------------- |
| **Текущее состояние** | Ничего                                           | **~99.0–99.5%**   | 3.6–7.3 часа      | ~$50 (1 VPS)         |
| **P1 внедрён**        | restart, healthchecks, limits, backups           | **~99.5–99.9%**   | 44 мин – 3.6 часа | ~$50                 |
| **P1 + P2**           | + Nginx, 2 реплики, circuit breakers, monitoring | **~99.9–99.95%**  | 22–44 мин         | ~$150 (2–3 VPS)      |
| **P1–P3**             | + PG replication, Redis Sentinel, PgBouncer      | **~99.95–99.99%** | 4.3–22 мин        | ~$400 (4–5 VPS)      |
| **P1–P4**             | + Kubernetes, auto-scaling, tracing              | **~99.99%**       | ≤ 4.3 мин         | ~$800+ (K8s cluster) |
| **P1–P5**             | + Multi-region, DR                               | **≥99.995%**      | ≤ 2.2 мин         | ~$2000+              |

### Итог

Для данного проекта (корпоративный мониторинг здоровья, не mission-critical в реальном времени):

- **99.95%** — реалистичная цель при бюджете ~$400/мес и внедрении P1–P3 (1–2 недели работы)
- **99.99%** — достижимо с Kubernetes и полным стеком мониторинга (~$800+/мес, 1–2 месяца)
- **99.999%** — нецелесообразно для данного типа системы (медицинские данные не real-time critical, SDK буферизирует данные и переотправляет при сбое)

**Рекомендация:** начать с P1 (за 1 день), затем P2 (за 3–5 дней), достигнув **99.9%+ за неделю**. Далее P3 по мере роста числа пользователей.
