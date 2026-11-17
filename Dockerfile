FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM build AS api
RUN pnpm --filter @zulu/api... build
ENV NODE_ENV=production API_PORT=3000
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM build AS web-build
ENV ZULU_BASE_PATH=/zulu/
RUN pnpm --filter @zulu/web... build

FROM nginx:1.27-alpine AS web
COPY deploy/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html/zulu
EXPOSE 80
