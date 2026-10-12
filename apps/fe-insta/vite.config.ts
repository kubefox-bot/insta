import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { realtimePath } from "@insta/contracts/realtime";
import { createUiMediaPlugin } from "@insta/fe-core/ui/build";
import adapter from "@sveltejs/adapter-bun";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import {
  BUILD_CONFIGURATION,
  CSS_CONFIGURATION,
  SSR_BUILD_CONFIGURATION,
  SSR_CONFIGURATION,
} from "./config/conts.ts";
import { withHostDevOrigin } from "./config/host-dev/adapter.ts";
import { createMediaSourceDirective } from "./config/host-dev/media-sources.ts";
import {
  readHostDevOrigin,
  readLocalFrontendServerConfiguration,
} from "./config/host-dev/read.ts";
import {
  createLocalViteWebSocketConfiguration,
  createRealtimeProxy,
} from "./config/host-dev/realtime-proxy.ts";

/**
 * Собирает локальный HTTPS Vite с отдельным WSS HMR и защищённым realtime proxy. Читает
 * существующие сертификаты; ошибки чтения прерывают конфигурацию, доверие системы не
 * меняется.
 */
const localFrontendServer = (
  configuration: NonNullable<
    ReturnType<typeof readLocalFrontendServerConfiguration>
  >,
) => {
  return {
    host: "127.0.0.1",
    ws: createLocalViteWebSocketConfiguration(configuration),
    https: {
      cert: readFileSync(resolve("../../infra/certs/localhost.crt")),
      key: readFileSync(resolve("../../infra/certs/localhost.key")),
    },
    proxy: createRealtimeProxy({
      path: realtimePath,
      target: configuration.apiBaseUrl,
      frontendOrigin: configuration.frontendOrigin,
      realtimeOrigin: configuration.realtimeOrigin,
    }),
  };
};

export default defineConfig(({ command }) => {
  const localServerConfiguration =
    command === "serve" ? readLocalFrontendServerConfiguration() : undefined;
  const localFrontend = localServerConfiguration
    ? localFrontendServer(localServerConfiguration)
    : undefined;
  return {
    plugins: [
      createUiMediaPlugin(),
      sveltekit({
        adapter: withHostDevOrigin({
          adapter: adapter({ out: "dist" }),
          origin: command === "serve" ? readHostDevOrigin() : undefined,
        }),
        // Native Svelte :global rules must reach Svelte before Lightning CSS.
        // Authored CSS Modules and final CSS minification keep their own Vite pipeline.
        preprocess: vitePreprocess({ style: false }),
        csp: {
          mode: "auto",
          directives: {
            "default-src": ["self"],
            "script-src": ["self"],
            "style-src": ["self", "unsafe-inline"],
            "connect-src": ["self", "wss:"],
            "img-src": ["self", "data:"],
            "media-src": createMediaSourceDirective(
              localServerConfiguration?.realtimeOrigin,
            ),
            "frame-ancestors": ["none"],
          },
        },
      }),
    ],
    css: CSS_CONFIGURATION,
    server: localFrontend,
    build: BUILD_CONFIGURATION,
    environments: { ssr: { build: SSR_BUILD_CONFIGURATION } },
    ssr: SSR_CONFIGURATION,
  };
});
