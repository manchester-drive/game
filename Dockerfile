FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json server.js ./
COPY public/ ./public/
USER node
CMD ["node", "server.js"]
