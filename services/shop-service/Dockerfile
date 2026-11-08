# shop-service. Build context = repo root:
#   docker build -f services/shop-service/Dockerfile .
# Same stages as core-service: deps -> build -> small non-root runtime.

FROM node:20-alpine AS base
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
COPY services/shop-service services/shop-service
RUN npm run build -w @threads/shared && npm run build -w @threads/shop-service

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
COPY --from=build /app/services/shop-service/dist services/shop-service/dist
COPY --from=build /app/services/shop-service/generated services/shop-service/generated
COPY services/shop-service/prisma services/shop-service/prisma
COPY services/shop-service/docker-entrypoint.sh services/shop-service/docker-entrypoint.sh
RUN sed -i 's/\r$//' services/shop-service/docker-entrypoint.sh && chmod +x services/shop-service/docker-entrypoint.sh

WORKDIR /app/services/shop-service
USER node
EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8001/api/shop/health/ >/dev/null || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
