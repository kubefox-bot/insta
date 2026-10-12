import { afterAll, expect, test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createServer } from "vite";
import { CSS_CONFIGURATION, SSR_CONFIGURATION } from "../../config/conts";
import { messages } from "../../src/lib/i18n/index";

const server = await createServer({
  root: new URL("../../", import.meta.url).pathname,
  configFile: false,
  cacheDir: new URL("../../node_modules/.vite-recorder", import.meta.url)
    .pathname,
  plugins: [svelte({ configFile: false })],
  ssr: {
    ...SSR_CONFIGURATION,
    // Keep the renderer and compiled components in one Vite-owned SSR context.
    noExternal: [...SSR_CONFIGURATION.noExternal, "svelte", /^svelte\//],
    optimizeDeps: {
      exclude: ["svelte", "svelte/server", "svelte/internal/server"],
    },
  },
  css: CSS_CONFIGURATION,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
afterAll(() => server.close());
const { render } = await server.ssrLoadModule("svelte/server");

test("recorder shows configured millisecond precision and localized seconds without truncating its limit", async () => {
  const { default: RecorderCamera } = await server.ssrLoadModule(
    "/src/domains/stories/components/RecorderCamera/index.svelte",
  );
  for (const [maxDurationMs, locale, expected] of [
    [201, "en", "00:00.201"],
    [10999, "en", "00:10.999"],
    [15000, "en", "00:15"],
    [201, "ru", "00:00,201"],
  ] as const) {
    const html = render(RecorderCamera, {
      props: {
        policy: { maxDurationMs },
        locale,
        copy: messages[locale],
        camera: { stream: null, state: { status: "recording", elapsedMs: 0 } },
        enable: () => {},
        start: () => {},
        stop: () => {},
      },
    }).body;
    expect(html).toContain(`00:00 / ${expected}`);
    const ready = render(RecorderCamera, {
      props: {
        policy: { maxDurationMs },
        locale,
        copy: messages[locale],
        camera: { stream: null, state: { status: "ready" } },
        enable: () => {},
        start: () => {},
        stop: () => {},
      },
    }).body;
    expect(ready).toContain(
      messages[locale].stories.durationLimit.replace(
        "{seconds}",
        expected.slice(3).replace(/^0(?=\d)/, ""),
      ),
    );
  }
});
