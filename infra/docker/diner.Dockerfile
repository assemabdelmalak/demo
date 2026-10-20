# syntax=docker/dockerfile:1
# @radd/diner image (DEPLOYMENT §2): prune → install → build → Next.js standalone, non-root.
ARG NODE_IMAGE=node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.9 prune @radd/diner --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ .
# No env needed at build time: public config is read at request time (ADR-012).
RUN pnpm turbo run build --filter=@radd/diner

FROM ${NODE_IMAGE} AS runtime
ARG GIT_SHA=dev
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    GIT_SHA=${GIT_SHA} \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
# The build script already copied .next/static and public into the standalone folder.
COPY --from=build --chown=node:node /repo/apps/diner/.next/standalone ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/diner/server.js"]
