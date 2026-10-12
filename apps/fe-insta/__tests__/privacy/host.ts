import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { publicPreferenceSchema } from "@insta/contracts/privacy";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createServer } from "vite";
import { CSS_CONFIGURATION, SSR_CONFIGURATION } from "../../config/conts";
export const createConsentHost = async ({
  frontendURL,
}: Readonly<{ frontendURL: () => string }>) => {
  const root = new URL("./fixtures/", import.meta.url).pathname;
  const observations: number[] = [];
  const failures: string[] = [];
  const server = await createServer({
    root,
    configFile: false,
    plugins: [
      svelte({ configFile: false }),
      {
        name: "privacy-standalone-host",
        configureServer: (viteServer) => {
          viteServer.middlewares.use((request, response, next) => {
            serveConsentRequest({
              request,
              response,
              next,
              server: viteServer,
              root,
              frontendURL,
              observations,
            }).catch((error: unknown) => {
              failures.push(error instanceof Error ? error.name : "unknown");
              response.statusCode = 500;
              response.end("Standalone host failure");
            });
          });
        },
      },
    ],
    ssr: SSR_CONFIGURATION,
    css: CSS_CONFIGURATION,
    server: {
      host: "127.0.0.1",
      port: 0,
      https: {
        key: await readFile(
          new URL("../../../../infra/certs/localhost.key", import.meta.url),
        ),
        cert: await readFile(
          new URL("../../../../infra/certs/localhost.crt", import.meta.url),
        ),
      },
      fs: { allow: [new URL("../../../../", import.meta.url).pathname] },
    },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string")
    throw new Error("Standalone host missing listener");
  return {
    url: `https://127.0.0.1:${address.port}`,
    observations,
    failures,
    close: () => server.close(),
  };
};
const readPublicPreference = async ({
  request,
  frontendURL,
}: Readonly<{ request: IncomingMessage; frontendURL: () => string }>) => {
  const response = await fetch(`${frontendURL()}/api/privacy/consent`, {
    headers: request.headers.cookie ? { cookie: request.headers.cookie } : {},
  });
  if (!response.ok) throw new Error("Built BFF read failed");
  return publicPreferenceSchema.parse(await response.json());
};
const relayPreference = async ({
  request,
  response,
  frontendURL,
}: Readonly<{
  request: IncomingMessage;
  response: ServerResponse;
  frontendURL: () => string;
}>) => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(new Uint8Array(chunk));
  const headers = Object.fromEntries(
    Object.entries(request.headers).flatMap(([name, value]) =>
      typeof value === "string" && !name.startsWith(":") ? [[name, value]] : [],
    ),
  );
  const authority = request.headers[":authority"] ?? request.headers.host;
  if (typeof authority === "string") headers.host = authority;
  const upstream = await fetch(`${frontendURL()}/api/privacy/consent`, {
    method: request.method ?? "GET",
    headers,
    ...(request.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
  });
  response.statusCode = upstream.status;
  for (const name of [
    "cache-control",
    "content-type",
    "set-cookie",
    "x-request-id",
  ]) {
    const value = upstream.headers.get(name);
    if (value) response.setHeader(name, value);
  }
  response.end(await upstream.text());
};
const serveConsentRequest = async ({
  request,
  response,
  next,
  server,
  root,
  frontendURL,
  observations,
}: Readonly<{
  request: IncomingMessage;
  response: ServerResponse;
  next: () => void;
  server: import("vite").ViteDevServer;
  root: string;
  frontendURL: () => string;
  observations: number[];
}>) => {
  const path = (request.url ?? "/").split("?")[0];
  if (path === "/api/privacy/consent") {
    await relayPreference({ request, response, frontendURL });
    return;
  }
  if (path === "/__test__/observation") {
    const state = await readPublicPreference({ request, frontendURL });
    const revision = Number(
      new URL(request.url ?? "/", "https://fixture.invalid").searchParams.get(
        "revision",
      ),
    );
    if (state.choice === "all" && state.revision === revision) {
      observations.push(revision);
      response.statusCode = 204;
    } else {
      response.statusCode = 403;
    }
    response.end();
    return;
  }
  if (path !== "/") {
    next();
    return;
  }
  const initial = await readPublicPreference({ request, frontendURL });
  const component = await server.ssrLoadModule("/Fixture/index.svelte");
  const { render } = await server.ssrLoadModule("svelte/server");
  const rendered = render(component.default, { props: { initial } });
  const template = await readFile(`${root}/index.html`, "utf8");
  const html = await server.transformIndexHtml(
    "/",
    template
      .replace("__BODY__", rendered.body)
      .replace('"__STATE__"', JSON.stringify(initial)),
  );
  response.setHeader("Content-Type", "text/html");
  response.end(html);
};
