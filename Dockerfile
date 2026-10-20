FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json next-env.d.ts next.config.ts ./
COPY app ./app
COPY lib ./lib
COPY scripts/prepare-standalone.mjs ./scripts/prepare-standalone.mjs
COPY scripts/prepare-assets.mjs ./scripts/prepare-assets.mjs
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=7860 HOSTNAME=0.0.0.0
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV APP_DATA_DIR=/mnt/workspace/jdtool
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=dependencies /app/node_modules/playwright ./node_modules/playwright
COPY --from=dependencies /app/node_modules/playwright-core ./node_modules/playwright-core
RUN node node_modules/playwright/cli.js install --with-deps --only-shell chromium
RUN mkdir -p /mnt/workspace/jdtool && chown -R node:node /mnt/workspace/jdtool
USER node
EXPOSE 7860
CMD ["node", "server.js"]
