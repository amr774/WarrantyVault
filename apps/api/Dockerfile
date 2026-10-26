FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY apps/api apps/api
COPY tsconfig.base.json ./
RUN npm run db:generate && npm run build -w apps/api
WORKDIR /app/apps/api
RUN mkdir -p /data/receipts && chown -R node:node /data
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
