import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { SSR_CONFIGURATION } from "../../config/conts";
import { withIsolatedViteTestServer } from "./isolated-vite-test-server";

test("SSR externalizes the shared server observability singleton", () => {
  expect(SSR_CONFIGURATION.external).toContain(
    "@insta/fe-core/observability/server",
  );
});

test("SSR graph invalidation keeps the shared context manager leased until the last root closes", async () => {
  await withIsolatedViteTestServer({
    config: {
      configFile: false,
      root: resolve(import.meta.dir, "../.."),
      logLevel: "silent",
      server: { middlewareMode: true },
      ssr: SSR_CONFIGURATION,
    },
    run: async (server) => {
      expect(server.config.cacheDir).not.toBe(
        resolve(import.meta.dir, "../../node_modules/.vite"),
      );
      const fixtureId = "/__tests__/fixtures/observability/lease.ts";
      let first:
        | ReturnType<
            Awaited<ReturnType<typeof server.ssrLoadModule>>["createLease"]
          >
        | undefined;
      let second: typeof first;
      try {
        const initialModule = await server.ssrLoadModule(fixtureId);
        first = initialModule.createLease();
        const moduleNode =
          await server.environments.ssr.moduleGraph.getModuleByUrl(fixtureId);
        if (!moduleNode)
          throw new Error("SSR fixture was missing from module graph");
        server.environments.ssr.moduleGraph.invalidateModule(moduleNode);
        const reloadedModule = await server.ssrLoadModule(fixtureId);
        second = reloadedModule.createLease();

        await first.close();
        await second.withSpan({
          name: "hmr-reload",
          headers: {},
          execute: () =>
            expect(reloadedModule.readContext()?.traceId).toMatch(
              /^[a-f0-9]{32}$/,
            ),
        });
      } finally {
        await first?.close();
        await second?.close();
      }
    },
  });
});
