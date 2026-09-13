# =========================
# 1. Build React frontend
# =========================
FROM node:22-bookworm-slim AS web-build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json

RUN npm install --workspace=@metrologyguard/web

COPY apps/web apps/web

ENV VITE_API_URL=/api

RUN npm run build --workspace=@metrologyguard/web


# =========================
# 2. Build Node API
# =========================
FROM node:22-bookworm-slim AS api-build

# better-sqlite3 is a native module.
# Build tools are required by node-gyp.
RUN apt-get update && \
    apt-get install -y \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

RUN npm install --workspace=@metrologyguard/api

COPY apps/api apps/api

RUN npm run build --workspace=@metrologyguard/api


# =========================
# 3. Final application image
# =========================
FROM node:22-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install Python, Nginx and curl
RUN apt-get update && \
    apt-get install -y \
        python3 \
        python3-venv \
        nginx \
        curl \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app


# =========================
# Python ML environment
# =========================

RUN python3 -m venv /opt/ml-venv

COPY services/ml-service/requirements.txt /tmp/ml-requirements.txt

RUN /opt/ml-venv/bin/pip install --no-cache-dir \
    -r /tmp/ml-requirements.txt

COPY services/ml-service /app/ml-service


# =========================
# Node API
# =========================

COPY --from=api-build /app/apps/api/dist /app/apps/api/dist

COPY --from=api-build /app/node_modules /app/node_modules



# =========================
# React frontend
# =========================

COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html


# =========================
# Nginx
# =========================

COPY docker/hf-nginx.conf /etc/nginx/conf.d/default.conf


# =========================
# Startup script
# =========================

COPY docker/start.sh /app/start.sh

RUN chmod +x /app/start.sh


# =========================
# Hugging Face port
# =========================

EXPOSE 7860

CMD ["/app/start.sh"]