FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/site/package.json ./apps/site/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/indexer/package.json ./packages/indexer/package.json
COPY packages/mcp/package.json ./packages/mcp/package.json
RUN npm ci

FROM dependencies AS build
COPY . .
ARG NEXT_PUBLIC_BRIM_SDK_DOCS_URL
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_BRIM_MODE=demo
ENV NEXT_PUBLIC_BRIM_SDK_DOCS_URL=$NEXT_PUBLIC_BRIM_SDK_DOCS_URL
RUN npm run build:packages && npm run build --workspace=@brim/web

FROM dependencies AS site-build
COPY . .
ARG NEXT_PUBLIC_BRIM_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_BRIM_APP_URL=$NEXT_PUBLIC_BRIM_APP_URL
RUN npm run build:site

FROM nginxinc/nginx-unprivileged:stable-alpine AS site
COPY infra/gcp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=site-build /app/apps/site/out /usr/share/nginx/html
EXPOSE 8080

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
