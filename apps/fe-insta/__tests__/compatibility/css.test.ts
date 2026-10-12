import { expect, test } from "bun:test";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { build, createServer } from "vite";
import {
  BUILD_CONFIGURATION,
  CSS_CONFIGURATION,
  SSR_CONFIGURATION,
} from "../../config/conts";
import { observeCssHmr } from "./lib/hmr/observe";

test("Lightning CSS modules retain mapping after HMR; Bits UI imports for SSR and client build", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "insta-css-"));
  await cp(new URL("./fixtures", import.meta.url), workspace, {
    recursive: true,
  });
  await symlink(
    new URL("../../node_modules", import.meta.url).pathname,
    join(workspace, "node_modules"),
    "dir",
  );
  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  const cssPath = join(workspace, "Fixture/styles.module.css");
  const server = await createServer({
    root: workspace,
    configFile: false,
    plugins: [svelte({ configFile: false })],
    ssr: SSR_CONFIGURATION,
    css: CSS_CONFIGURATION,
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  try {
    await server.listen();
    const imported = await server.ssrLoadModule("/Fixture/index.svelte");
    const { render } = await server.ssrLoadModule("svelte/server");
    const initial = render(imported.default);
    expect(initial.body).toContain("data-css-probe");
    expect(initial.body).toContain("Совместимость");
    const cssModule = await server.ssrLoadModule("/Fixture/styles.module.css");
    const className = cssModule.default.surface;
    expect(className).toMatch(/^styles-module_surface_\w+$/);
    expect(initial.body).toContain(`class="${className}"`);
    const address = server.httpServer?.address();
    if (!address || typeof address === "string")
      throw new Error("Vite HTTP listener missing");
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/`, "vite-hmr");
    const update = await observeCssHmr({
      socket,
      timeoutMs: 5000,
      change: async () => {
        await server.transformRequest("/Fixture/styles.module.css");
        await server.transformRequest("/Fixture/index.svelte");
        await writeFile(cssPath, ".surface { color: rgb(40, 50, 60); }");
      },
    });
    expect(update).toContain("/Fixture/index.svelte");
    expect(
      (await server.ssrLoadModule("/Fixture/styles.module.css")).default
        .surface,
    ).toBe(className);
    const transformed = await server.transformRequest(
      "/Fixture/styles.module.css",
    );
    expect(transformed?.code).toContain("#28323c");
    await build({
      root: workspace,
      configFile: false,
      plugins: [svelte({ configFile: false })],
      css: CSS_CONFIGURATION,
      build: BUILD_CONFIGURATION,
      logLevel: "error",
    });
    const assets = join(workspace, "dist/assets");
    const names = await readdir(assets);
    const cssFiles = names.filter((name) => name.endsWith(".css"));
    const javascriptFiles = names.filter((name) => name.endsWith(".js"));
    expect(cssFiles.length).toBeGreaterThan(0);
    expect(javascriptFiles.length).toBeGreaterThan(0);
    const css = (
      await Promise.all(
        cssFiles.map((name) => readFile(join(assets, name), "utf8")),
      )
    ).join("\n");
    const javascript = (
      await Promise.all(
        javascriptFiles.map((name) => readFile(join(assets, name), "utf8")),
      )
    ).join("\n");
    expect(css).toContain(`.${className}`);
    expect(css).toContain("#28323c");
    expect(javascript).toContain(className);
  } finally {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  }
}, 20000);
