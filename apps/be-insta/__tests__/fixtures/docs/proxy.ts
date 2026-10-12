import { resolve } from "node:path";
import { z } from "zod";

export const startDocsProxy = async (backendUrl: string) => {
  const configuration = z
    .object({
      http: z.object({
        routers: z.object({
          "docs-api": z.object({
            rule: z.string(),
            service: z.literal("backend"),
            priority: z.number(),
            middlewares: z.array(z.string()),
          }),
          docs: z.object({
            rule: z.string(),
            service: z.literal("backend"),
            priority: z.number(),
            middlewares: z.array(z.string()),
          }),
        }),
        middlewares: z.object({
          "docs-api-prefix": z.object({
            stripPrefix: z.object({ prefixes: z.tuple([z.string()]) }),
          }),
        }),
      }),
    })
    .parse(
      Bun.YAML.parse(
        await Bun.file(
          resolve(import.meta.dir, "../../../../../infra/traefik/dynamic.yml"),
        ).text(),
      ),
    );
  const prefix =
    configuration.http.middlewares["docs-api-prefix"].stripPrefix.prefixes[0];
  // This isolated proxy exercises configured prefix adaptation against real Nest;
  // live Traefik matching and middleware execution have a separate runtime check.
  const proxy = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (request) => {
      const incoming = new URL(request.url);
      if (
        incoming.pathname !== prefix &&
        !incoming.pathname.startsWith(`${prefix}/`)
      )
        return new Response(null, { status: 404 });
      const target = new URL(
        `${incoming.pathname.slice(prefix.length) || "/"}${incoming.search}`,
        backendUrl,
      );
      return fetch(target, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
    },
  });
  return {
    url: proxy.url,
    routing: configuration.http,
    close: () => proxy.stop(true),
  };
};
