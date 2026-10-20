# syntax=docker/dockerfile:1
# @radd/api image (DEPLOYMENT §2): prune → install → build → slim non-root runtime.
ARG NODE_IMAGE=node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Only the workspace packages @radd/api depends on, so unrelated changes keep the install cached.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.9 prune @radd/api --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter=@radd/api
# Self-contained folder: dist + production dependencies, workspace packages included.
# --ignore-scripts: the root prepare script installs git hooks and there is no git in the image.
RUN pnpm --filter @radd/api deploy --prod --legacy --ignore-scripts /out

FROM ${NODE_IMAGE} AS runtime
ARG GIT_SHA=dev
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    GIT_SHA=${GIT_SHA} \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.API_PORT ?? '4000') + '/v1/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
