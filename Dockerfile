FROM node:22-alpine AS builder

RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    rsync

WORKDIR /app

# file: packages/* must exist before npm ci (local plugin deps)
COPY package*.json ./
COPY packages/plugin-adult/package.json ./packages/plugin-adult/
COPY packages/plugin-stash/package.json ./packages/plugin-stash/
COPY packages/plugin-jellyfin/package.json ./packages/plugin-jellyfin/
COPY packages/plugin-plex/package.json ./packages/plugin-plex/
COPY packages/plugin-emby/package.json ./packages/plugin-emby/
COPY packages/plugin-tmdb/package.json ./packages/plugin-tmdb/
RUN npm ci --ignore-scripts

COPY . .

RUN node scripts/compile.mjs backend \
    && npm rebuild better-sqlite3 \
    && npx vite build

FROM node:22-alpine AS runner

RUN apk add --no-cache \
    ffmpeg \
    tini \
    su-exec \
    shadow

WORKDIR /app

COPY package*.json ./
COPY packages/plugin-adult/package.json ./packages/plugin-adult/
COPY packages/plugin-stash/package.json ./packages/plugin-stash/
COPY packages/plugin-jellyfin/package.json ./packages/plugin-jellyfin/
COPY packages/plugin-plex/package.json ./packages/plugin-plex/
COPY packages/plugin-emby/package.json ./packages/plugin-emby/
COPY packages/plugin-tmdb/package.json ./packages/plugin-tmdb/
# Skip a second native rebuild here: under QEMU arm64, `npm rebuild better-sqlite3`
# intermittently dies with SIGILL (exit 132). Reuse the builder binary instead.
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/app ./app
COPY --from=builder /app/api ./api
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/packages/plugin-adult/src/server ./packages/plugin-adult/src/server
COPY --from=builder /app/packages/plugin-adult/package.json ./packages/plugin-adult/package.json
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Prefer Alpine system binaries over glibc ffmpeg-static / ffprobe-static.
ENV FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    NODE_ENV=production \
    MEDIA_CHIPS_ALLOW_LAN=1 \
    MEDIA_CHIPS_DATA_DIR=/data \
    PUID=1001 \
    PGID=1001

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/app_storage /data \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001 -G nodejs \
    && chown -R nodejs:nodejs /app /data

EXPOSE 12321

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:12321/api/health >/dev/null || exit 1

ENTRYPOINT ["tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "app/server.js"]
