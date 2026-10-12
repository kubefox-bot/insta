import { createRequire } from "node:module";
import { rendererPolicy } from "./conts";
import type { RendererCompiler } from "./types";

const resolveFromApp = createRequire(
  new URL("../../../../apps/fe-insta/package.json", import.meta.url),
);
const compiler: RendererCompiler = await import(resolveFromApp.resolve("vite"));
const plugin: typeof import("@sveltejs/vite-plugin-svelte") = await import(
  resolveFromApp.resolve("@sveltejs/vite-plugin-svelte")
);
await compiler.build({
  configFile: false,
  root: import.meta.dirname,
  base: rendererPolicy.base,
  plugins: [plugin.svelte({ configFile: false })],
  resolve: {
    alias: {
      "@insta/ui-kit/styles.css": resolveFromApp.resolve(
        "@insta/ui-kit/styles.css",
      ),
    },
  },
  css: { transformer: "lightningcss" },
  build: {
    outDir: new URL(`../../../../${rendererPolicy.output}`, import.meta.url)
      .pathname,
    emptyOutDir: true,
  },
});
