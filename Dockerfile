FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS manifests
WORKDIR /workspace
COPY package.json bun.lock ./
COPY apps/be-insta/package.json apps/be-insta/package.json
COPY apps/fe-insta/package.json apps/fe-insta/package.json
COPY packages/fe-core/package.json packages/fe-core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui-kit/package.json packages/ui-kit/package.json
COPY packages/media-recorder/package.json packages/media-recorder/package.json

FROM manifests AS installed
RUN bun install --frozen-lockfile --ignore-scripts

# Infrastructure scripts import backend configuration and Dragonfly owners.
# Keep this source-capable target separate from application builders.
FROM installed AS dependencies
COPY . .

FROM installed AS frontend-build
COPY packages/fe-core packages/fe-core
COPY packages/contracts packages/contracts
COPY packages/ui-kit packages/ui-kit
COPY packages/media-recorder packages/media-recorder
COPY apps/fe-insta apps/fe-insta
RUN bun run --cwd apps/fe-insta build

FROM installed AS backend-build
COPY packages/fe-core packages/fe-core
COPY packages/contracts packages/contracts
COPY apps/be-insta apps/be-insta
RUN bun run --cwd apps/be-insta build

FROM manifests AS production-cache
# Reuse the frozen development install's downloads without retaining its dev tree.
COPY --from=installed /root/.bun/install/cache /root/.bun/install/cache

# Each app declares its external runtime workspace dependencies.
FROM production-cache AS frontend-dependencies
RUN bun install --production --offline --frozen-lockfile --ignore-scripts --filter './apps/fe-insta' --filter '!./'

FROM production-cache AS backend-dependencies
RUN bun install --production --offline --frozen-lockfile --ignore-scripts --filter './apps/be-insta' --filter '!./'

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS runtime
WORKDIR /workspace
COPY package.json ./
COPY packages/fe-core/package.json ./packages/fe-core/package.json
COPY packages/fe-core/src/observability ./packages/fe-core/src/observability
COPY packages/fe-core/src/dragonfly/server/*.ts ./packages/fe-core/src/dragonfly/server/
COPY packages/fe-core/src/dates/*.ts ./packages/fe-core/src/dates/
COPY packages/fe-core/src/lifecycle ./packages/fe-core/src/lifecycle
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/contracts/src ./packages/contracts/src
ARG SOURCE_TREE
ARG SOURCE_MANIFEST
LABEL insta.source-tree=$SOURCE_TREE insta.source-manifest=$SOURCE_MANIFEST

FROM runtime AS frontend
COPY --from=frontend-dependencies /workspace/node_modules ./node_modules
COPY --from=frontend-dependencies /workspace/apps/fe-insta/node_modules ./apps/fe-insta/node_modules
COPY --from=frontend-dependencies /workspace/packages/fe-core/node_modules ./packages/fe-core/node_modules
COPY --from=frontend-dependencies /workspace/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=frontend-dependencies /workspace/packages/ui-kit/node_modules ./packages/ui-kit/node_modules
COPY --from=frontend-dependencies /workspace/packages/media-recorder/node_modules ./packages/media-recorder/node_modules
COPY packages/ui-kit/package.json ./packages/ui-kit/package.json
COPY packages/ui-kit/src ./packages/ui-kit/src
COPY packages/media-recorder/package.json ./packages/media-recorder/package.json
COPY packages/media-recorder/src ./packages/media-recorder/src
COPY --from=frontend-build /workspace/apps/fe-insta/package.json ./apps/fe-insta/package.json
COPY --from=frontend-build /workspace/apps/fe-insta/dist ./apps/fe-insta/dist
WORKDIR /workspace/apps/fe-insta
USER bun
CMD ["bun", "--preload", "./dist/observability-preload.js", "dist/index.js"]

FROM runtime AS backend
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg=7:7.1.5-0+deb13u1 && rm -rf /var/lib/apt/lists/*
COPY --from=backend-dependencies /workspace/node_modules ./node_modules
COPY --from=backend-dependencies /workspace/apps/be-insta/node_modules ./apps/be-insta/node_modules
COPY --from=backend-dependencies /workspace/packages/fe-core/node_modules ./packages/fe-core/node_modules
COPY --from=backend-dependencies /workspace/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=backend-build /workspace/apps/be-insta/package.json ./apps/be-insta/package.json
COPY --from=backend-build /workspace/apps/be-insta/dist ./apps/be-insta/dist
# The package import map launches this Bun worker outside the main bundle.
COPY --from=backend-build /workspace/apps/be-insta/src/domains/stories/adapters/media ./apps/be-insta/src/domains/stories/adapters/media
COPY --from=backend-build /workspace/apps/be-insta/src/domains/stories/domain/media ./apps/be-insta/src/domains/stories/domain/media
WORKDIR /workspace/apps/be-insta
USER bun
CMD ["bun", "dist/main.js"]

FROM dependencies AS build
COPY --from=frontend-build /workspace/apps/fe-insta/dist ./apps/fe-insta/dist
COPY --from=backend-build /workspace/apps/be-insta/dist ./apps/be-insta/dist
RUN cd apps/fe-insta && bun --bun svelte-kit sync
RUN bun __tests__/unit/stories/renderer/build.ts
ARG SOURCE_TREE
ARG SOURCE_MANIFEST
LABEL insta.source-tree=$SOURCE_TREE insta.source-manifest=$SOURCE_MANIFEST
FROM build AS media-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg=7:7.1.5-0+deb13u1 && rm -rf /var/lib/apt/lists/*
FROM media-runtime AS testhost
USER bun
CMD ["bun", "test", "./__tests__/integration", "--timeout", "60000"]
