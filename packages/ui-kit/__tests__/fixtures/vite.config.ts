import { readFile } from "node:fs/promises";
import { createUiMediaPlugin } from "@insta/fe-core/ui/build";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const config = defineConfig({
  root: import.meta.dirname,
  css: { transformer: "lightningcss" },
  plugins: [
    createUiMediaPlugin(),
    svelte({ configFile: false }),
    {
      name: "ui-fixture-ssr-and-browser-boundary",
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
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk") continue;
          const forbidden = Object.keys(chunk.modules).find((id) =>
            /(?:node_modules\/(?:react|@mantine)\/|lib\/config\/server\/|fe-core\/src\/(?:ui\/build\/|architecture\/|api-boundaries\/|observability\/server\/|(?:index|cli)\.ts))/.test(
              id,
            ),
          );
          if (forbidden)
            this.error(
              `Server or React/Mantine dependency in UI browser graph: ${forbidden}`,
            );
        }
      },
    },
  ],
  build: { outDir: "../../../../.infra/ui/fixture-build", emptyOutDir: true },
});

export default config;
