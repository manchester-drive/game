FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN bun run build

FROM debian:bookworm-slim
COPY --from=build /app/dist/manchester-drive /usr/local/bin/manchester-drive
ENV HOST=0.0.0.0
EXPOSE 4173
# Fly mounts the data volume owned by root. Start as root only to hand the
# volume to the unprivileged user, then drop to that user for the server.
CMD ["sh", "-c", "mkdir -p /data && chown -R 65532:65532 /data && exec setpriv --reuid=65532 --regid=65532 --clear-groups manchester-drive"]
