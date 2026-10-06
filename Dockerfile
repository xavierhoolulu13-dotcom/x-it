# X-IT v3 production image.
#
# Includes a real Chromium (for the browser-automation engine) and a sandbox
# toolchain, so a single container can run the app, drive a browser and execute
# tools. For stronger isolation point SANDBOX_BACKEND at a Docker daemon instead.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    X_IT_CHROME_EXECUTABLE_PATH=/usr/bin/chromium \
    X_IT_DATA_DIR=/app/data \
    SANDBOX_BACKEND=auto

# Chromium plus the sandbox toolchain (shell, python, node, git, curl).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      curl \
      git \
      procps \
      python3 \
      python3-pip \
      ripgrep \
      unzip \
      jq \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
