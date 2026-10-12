import { readFile } from "node:fs/promises";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const config = defineConfig({
  root: import.meta.dirname,
  cacheDir: new URL(
    "../../../../node_modules/.vite-marks-fixture",
    import.meta.url,
  ).pathname,
  plugins: [
    svelte({ configFile: false }),
    {
      name: "marks-ssr-hydration-fixture",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url !== "/") {
            next();
            return;
          }
          const renderPage = async () => {
            const [{ default: App }, { render }] = await Promise.all([
              server.ssrLoadModule("./App.svelte"),
              server.ssrLoadModule("svelte/server"),
            ]);
            const rendered = render(App);
            const template = await readFile(
              new URL("./index.html", import.meta.url),
              "utf8",
            );
            const html = await server.transformIndexHtml(
              "/",
              template.replace(
                '<div id="app"></div>',
                `<div id="app">${rendered.body}</div>`,
              ),
            );
            response.setHeader("Content-Type", "text/html");
            response.end(html);
          };
          renderPage().catch(next);
        });
      },
    },
  ],
  css: { transformer: "lightningcss" },
});

export { config as default };
