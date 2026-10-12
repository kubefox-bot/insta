import { expect, test } from "bun:test";
import { z } from "zod";
import { createApplication } from "../../../src/app/bootstrap";
import { exportOpenApi } from "../../../src/app/openapi";
import { startDocsProxy } from "../../fixtures/docs/proxy";

const start = async (ready = true) => {
  const app = await createApplication(
    {
      checkRequired: async () => ready,
      check: async () => ({ ready, mail: "ok", delivery: "ok" }),
      close: async () => {},
    },
    { mode: "offline" },
  );
  try {
    await app.listen(0, "127.0.0.1");
    return { app, url: await app.getUrl() };
  } catch (error) {
    await app.close();
    throw error;
  }
};

test("docs HTML resolves same-origin resources for canonical, alias and query entry URLs", async () => {
  const { app, url } = await start();
  try {
    for (const path of [
      "/docs",
      "/docs/",
      "/docs/index.html",
      "/docs?probe=1",
      "/docs/?probe=1",
      "/docs/index.html?probe=1",
    ]) {
      const response = await fetch(`${url}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      const html = await response.text();
      expect(html).toContain('id="swagger-ui"');
      const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
        (match) => new URL(match[1] ?? "", response.url),
      );
      expect(resources.length).toBeGreaterThanOrEqual(6);
      for (const resource of resources) {
        expect(resource.origin).toBe(new URL(url).origin);
        expect(resource.pathname.startsWith("/docs/")).toBe(true);
        const asset = await fetch(resource);
        expect(asset.status, resource.pathname).toBe(200);
        expect((await asset.arrayBuffer()).byteLength).toBeGreaterThan(0);
      }
    }
  } finally {
    await app.close();
  }
});

test("documentation aliases redirect GET and HEAD to the canonical entry while preserving the query", async () => {
  const { app, url } = await start();
  try {
    for (const method of ["GET", "HEAD"])
      for (const path of ["/docs/", "/docs/index.html"])
        for (const query of ["", "?probe=a%2Fb&second=1"]) {
          const response = await fetch(`${url}${path}${query}`, {
            method,
            redirect: "manual",
          });
          expect(response.status).toBe(307);
          expect(response.headers.get("location")).toBe(`/docs${query}`);
        }
    expect((await fetch(`${url}/docs`, { redirect: "manual" })).status).toBe(
      200,
    );
    expect(
      (await fetch(`${url}/docs?probe=1`, { redirect: "manual" })).status,
    ).toBe(200);
    for (const path of ["/docs/", "/docs/index.html"]) {
      const response = await fetch(`${url}${path}`, {
        method: "POST",
        redirect: "manual",
      });
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
    }
  } finally {
    await app.close();
  }
});

test("runtime OpenAPI adds only the docs API server and preserves canonical native paths, schemas and bearer security", async () => {
  const { app, url } = await start();
  try {
    const response = await fetch(`${url}/docs/openapi.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const runtime = await response.json();
    const canonical = await exportOpenApi();
    expect(runtime.servers).toEqual([{ url: "/docs/api" }]);
    expect({ ...runtime, servers: canonical.servers }).toEqual(canonical);
    expect(canonical.servers).toEqual([]);
    expect(runtime.paths["/v1/me"].get.security).toEqual([{ bearer: [] }]);
    expect(runtime.components.securitySchemes.bearer).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect((await fetch(`${url}/docs-json`)).status).toBe(404);
    expect((await fetch(`${url}/docs-yaml`)).status).toBe(404);
  } finally {
    await app.close();
  }
});

test("Swagger initializes a same-origin schema URL without external validator or persistent credentials", async () => {
  const { app, url } = await start();
  try {
    const response = await fetch(`${url}/docs/swagger-ui-init.js`);
    expect(response.status).toBe(200);
    const initialization = await response.text();
    const serialized = initialization.match(
      /let options = (\{[\s\S]*?\});/,
    )?.[1];
    expect(serialized).toBeDefined();
    const options = z
      .object({
        swaggerUrl: z.string(),
        customOptions: z.object({
          validatorUrl: z.null(),
          persistAuthorization: z.literal(false),
        }),
      })
      .parse(JSON.parse(serialized ?? ""));
    expect(options.swaggerUrl).toBe("/docs/openapi.json");
  } finally {
    await app.close();
  }
});

test("docs remain readable during dependency failure without exempting native API or lookalike paths", async () => {
  const { app, url } = await start(false);
  try {
    for (const path of [
      "/docs",
      "/docs/",
      "/docs/index.html",
      "/docs/openapi.json",
      "/docs/swagger-ui-init.js",
      "/docs/swagger-ui-bundle.js",
      "/docs/swagger-ui-standalone-preset.js",
      "/docs/swagger-ui.css",
      "/docs/favicon-16x16.png",
      "/docs/favicon-32x32.png",
    ])
      expect((await fetch(`${url}${path}`)).status, path).toBe(200);
    for (const path of [
      "/v1/me",
      "/docs/api",
      "/docs/api/v1/me",
      "/docs-malicious",
      "/docs/unknown",
    ]) {
      const response = await fetch(`${url}${path}`);
      expect(response.status, path).toBe(503);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: "DEPENDENCY_UNAVAILABLE" },
      });
    }
    const headersTooLarge = await fetch(`${url}/docs`, {
      headers: { "X-Synthetic-Oversize": "x".repeat(16384) },
    });
    expect(headersTooLarge.status).toBe(431);
  } finally {
    await app.close();
  }
});

test("documented protected operation still rejects a native request without Bearer credentials", async () => {
  const { app, url } = await start();
  try {
    const response = await fetch(`${url}/v1/me`);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "ACCESS_TOKEN_INVALID" },
    });
  } finally {
    await app.close();
  }
});

test("docs API proxy strips its configured prefix and retains native authentication and payload admission", async () => {
  const { app, url } = await start();
  try {
    const proxy = await startDocsProxy(url);
    try {
      const { routers, middlewares } = proxy.routing;
      expect(routers["docs-api"].rule).toBe(
        "Path(`/docs/api`) || PathPrefix(`/docs/api/`)",
      );
      expect(routers.docs.rule).toBe("Path(`/docs`) || PathPrefix(`/docs/`)");
      expect(routers["docs-api"].priority).toBeGreaterThan(
        routers.docs.priority,
      );
      expect(routers["docs-api"].middlewares).toEqual([
        "security",
        "private",
        "payload",
        "docs-api-prefix",
      ]);
      expect(routers.docs.middlewares).toEqual(["security", "private"]);
      expect(middlewares["docs-api-prefix"].stripPrefix.prefixes).toEqual([
        "/docs/api",
      ]);
      const live = await fetch(new URL("/docs/api/health/live", proxy.url));
      expect(live.status).toBe(200);
      expect(await live.json()).toMatchObject({
        ok: true,
        data: { status: "ok" },
      });
      const protectedRequest = await fetch(
        new URL("/docs/api/v1/me", proxy.url),
      );
      expect(protectedRequest.status).toBe(401);
      expect(await protectedRequest.json()).toMatchObject({
        ok: false,
        error: { code: "ACCESS_TOKEN_INVALID" },
      });
      const oversize = await fetch(
        new URL("/docs/api/v1/auth/login", proxy.url),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "x".repeat(65536) }),
        },
      );
      expect(oversize.status).toBe(413);
    } finally {
      await proxy.close();
    }
  } finally {
    await app.close();
  }
});
