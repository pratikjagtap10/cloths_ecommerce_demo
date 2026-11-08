# core-service (also used for core-worker). Build context = repo root:
#   docker build -f services/core-service/Dockerfile .
#
#   deps    -> npm ci for the whole workspace (cached while package files don't change)
#   build   -> compile packages/shared + this service, generate the Prisma client
#   runtime -> production dependencies + compiled JS only, runs as non-root user

FROM node:20-alpine AS base
# Prisma's query engine needs OpenSSL
RUN apk add --no-cache openssl
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/core-service/package.json services/core-service/
COPY services/shop-service/package.json services/shop-service/
RUN npm ci --no-audit --no-fund

# ---------- build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/core-service services/core-service
RUN npm run build -w @threads/shared && npm run build -w @threads/core-service

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/core-service/package.json services/core-service/
COPY services/shop-service/package.json services/shop-service/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/core-service/dist services/core-service/dist
COPY --from=build /app/services/core-service/generated services/core-service/generated
COPY services/core-service/prisma services/core-service/prisma
COPY services/core-service/seed-data services/core-service/seed-data
COPY services/core-service/docker-entrypoint.sh services/core-service/docker-entrypoint.sh
# Strip Windows line endings in case the script was saved with CRLF
RUN sed -i 's/\r$//' services/core-service/docker-entrypoint.sh && chmod +x services/core-service/docker-entrypoint.sh

WORKDIR /app/services/core-service
USER node
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8000/api/core/health/ >/dev/null || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
