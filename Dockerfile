# syntax=docker/dockerfile:1

# ==========================================================================
# Stage 1: build — install deps and produce the static site in /app/dist
# node:24-slim (Debian glibc) is chosen over alpine on purpose: sharp ships
# rock-solid prebuilt glibc binaries, so no system packages are needed.
# ==========================================================================
FROM node:24-slim AS builder
WORKDIR /app

# Optional: fetch a private data archive at build time, mirroring the
# DATA_SOURCE_URL mechanism of .github/workflows/deploy.yml.
#   docker build --build-arg DATA_SOURCE_URL="https://.../data.zip" .
# When unset, the build falls back to the bundled data.example/
# (see src/lib/data-dir.ts) and produces the demo site.
ARG DATA_SOURCE_URL=""

# playwright (devDependency) would otherwise download ~400 MB of browsers
# during npm ci; the build pipeline never uses them.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Inject private data only when DATA_SOURCE_URL is provided. `data/` itself
# is excluded via .dockerignore, so the local private directory can never
# leak into the image by accident.
RUN if [ -n "$DATA_SOURCE_URL" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends curl unzip ca-certificates \
      && curl -fsSL "$DATA_SOURCE_URL" -o /tmp/data.zip \
      && mkdir -p data && unzip -oq /tmp/data.zip -d data \
      && rm -f /tmp/data.zip \
      && rm -rf /var/lib/apt/lists/* ; \
    fi

RUN npm run build

# ==========================================================================
# Stage 2: runtime — nginx serves the static output
# ==========================================================================
FROM nginx:alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
