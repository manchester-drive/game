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
USER 65532:65532
CMD ["manchester-drive"]
