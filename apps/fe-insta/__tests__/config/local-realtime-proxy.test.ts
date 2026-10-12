import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";
import { realtimePath } from "@insta/contracts/realtime";
import {
  apiBaseUrlKey,
  localFrontendMarker,
  localHMRPortKey,
  originKey,
  realtimeOriginKey,
} from "../../config/host-dev/conts";
import { createMediaSourceDirective } from "../../config/host-dev/media-sources";
import { readLocalFrontendServerConfiguration } from "../../config/host-dev/read";
import {
  acceptsRealtimeProxyRequest,
  createLocalViteWebSocketConfiguration,
  createRealtimeProxy,
  rewriteRealtimeProxyOrigin,
} from "../../config/host-dev/realtime-proxy";
import { withIsolatedViteTestServer } from "./isolated-vite-test-server";

describe("local realtime proxy", () => {
  test("serves a TLS verified Vite HMR websocket on its loopback port", async () => {
    const hmrPort = await availablePort();
    const vitePort = await availablePort();
    const certificatePath = resolve("infra/certs/localhost.crt");
    await withIsolatedViteTestServer({
      config: {
        configFile: false,
        server: {
          host: "127.0.0.1",
          port: vitePort,
          strictPort: true,
          https: {
            cert: readFileSync(certificatePath),
            key: readFileSync(resolve("infra/certs/localhost.key")),
          },
          ws: createLocalViteWebSocketConfiguration({
            frontendOrigin: "https://localhost:5173",
            hmrPort,
          }),
        },
      },
      run: async (server) => {
        expect(server.config.cacheDir).not.toBe(
          resolve(import.meta.dir, "../../node_modules/.vite"),
        );
        await server.listen();
        const page = await runCurl([
          "--silent",
          "--show-error",
          "--max-time",
          "2",
          "--cacert",
          certificatePath,
          "--resolve",
          `localhost:${vitePort}:127.0.0.1`,
          `https://localhost:${vitePort}/`,
        ]);
        expect(page.exitCode).toBe(0);
        const handshake = await runCurl([
          "--silent",
          "--show-error",
          "--verbose",
          "--include",
          "--no-buffer",
          "--max-time",
          "2",
          "--cacert",
          certificatePath,
          "--resolve",
          `localhost:${hmrPort}:127.0.0.1`,
          "--header",
          "Connection: Upgrade",
          "--header",
          "Upgrade: websocket",
          "--header",
          "Sec-WebSocket-Version: 13",
          "--header",
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
          "--header",
          "Sec-WebSocket-Protocol: vite-ping",
          "--header",
          "Origin: https://localhost:5173",
          `https://localhost:${hmrPort}/`,
        ]);
        expect(handshake.output).toContain("HTTP/1.1 101 Switching Protocols");
        expect(handshake.output).toContain("Sec-WebSocket-Protocol: vite-ping");
      },
    });
  }, 10_000);

  test("forwards same-origin HTTP/2 polling through its single authority", async () => {
    const backendPort = await availablePort();
    const vitePort = await availablePort();
    const certificatePath = resolve("infra/certs/localhost.crt");
    const received: { origin?: string; url?: string; count: number } = {
      count: 0,
    };
    const backend = createHttpServer((request, response) => {
      received.count += 1;
      received.origin = request.headers.origin;
      received.url = request.url;
      response.end("upstream");
    });
    await listen(backend, backendPort);
    try {
      await withIsolatedViteTestServer({
        config: {
          configFile: false,
          server: {
            host: "127.0.0.1",
            port: vitePort,
            strictPort: true,
            https: {
              cert: readFileSync(certificatePath),
              key: readFileSync(resolve("infra/certs/localhost.key")),
            },
            proxy: createRealtimeProxy({
              path: realtimePath,
              target: `http://127.0.0.1:${backendPort}`,
              frontendOrigin: `https://localhost:${vitePort}`,
              realtimeOrigin: "https://localhost",
            }),
          },
        },
        run: async (server) => {
          expect(server.config.cacheDir).not.toBe(
            resolve(import.meta.dir, "../../node_modules/.vite"),
          );
          await server.listen();
          const response = await runCurl([
            "--silent",
            "--show-error",
            "--include",
            "--http2",
            "--max-time",
            "3",
            "--cacert",
            certificatePath,
            "--resolve",
            `localhost:${vitePort}:127.0.0.1`,
            "--header",
            "Sec-Fetch-Site: same-origin",
            `https://localhost:${vitePort}${realtimePath}/?EIO=4&transport=polling`,
          ]);
          expect(response.exitCode).toBe(0);
          expect(response.output).toContain("HTTP/2 200");
          expect(response.output).toContain("upstream");
          expect(received).toEqual({
            origin: "https://localhost",
            url: `${realtimePath}/?EIO=4&transport=polling`,
            count: 1,
          });
          const foreignAuthority = await runCurl([
            "--silent",
            "--show-error",
            "--include",
            "--http2",
            "--max-time",
            "3",
            "--cacert",
            certificatePath,
            "--resolve",
            `localhost:${vitePort}:127.0.0.1`,
            "--header",
            "Sec-Fetch-Site: same-origin",
            "--header",
            "Host: attacker.example",
            `https://localhost:${vitePort}${realtimePath}/?EIO=4&transport=polling`,
          ]);
          expect(foreignAuthority.exitCode).toBe(0);
          expect(foreignAuthority.output).toContain("HTTP/2 404");
          expect(received.count).toBe(1);
        },
      });
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        backend.close((error) => (error ? reject(error) : resolveClose())),
      );
    }
  }, 10_000);

  test("forwards the canonical backend origin on proxied realtime requests", () => {
    const headers = new Map<string, string>();
    rewriteRealtimeProxyOrigin({
      request: { setHeader: (name, value) => headers.set(name, value) },
      origin: "https://localhost",
    });

    expect(headers.get("origin")).toBe("https://localhost");
  });

  test("uses the canonical realtime path for the Vite proxy", () => {
    expect(
      createRealtimeProxy({
        path: realtimePath,
        target: "http://127.0.0.1:3000",
        frontendOrigin: "https://localhost:5173",
        realtimeOrigin: "https://localhost",
      }),
    ).toHaveProperty(realtimePath);
  });

  test("allows only the exact local frontend origin for websocket upgrades", () => {
    const request = {
      headers: {
        origin: "https://localhost:5173",
        host: "localhost:5173",
        upgrade: "websocket",
      },
      rawHeaders: [
        "Host",
        "localhost:5173",
        "Origin",
        "https://localhost:5173",
      ],
    };
    expect(
      acceptsRealtimeProxyRequest({
        request,
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(true);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...request,
          headers: { ...request.headers, origin: "https://attacker.example" },
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...request,
          headers: { ...request.headers, host: "attacker.example" },
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...request,
          rawHeaders: [...request.rawHeaders, "host", "localhost:5173"],
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...request,
          headers: { host: "localhost:5173", upgrade: "websocket" },
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
  });

  test("allows originless polling only for a same-origin browser request", () => {
    const request = {
      headers: {
        host: "localhost:5173",
        "sec-fetch-site": "same-origin",
      },
      rawHeaders: ["Host", "localhost:5173", "Sec-Fetch-Site", "same-origin"],
    };
    expect(
      acceptsRealtimeProxyRequest({
        request,
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(true);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...request,
          rawHeaders: [...request.rawHeaders, "host", "attacker.example"],
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...request,
          headers: { ...request.headers, "sec-fetch-site": "cross-site" },
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
  });

  test("normalizes one HTTP/2 authority and rejects ambiguous authorities", () => {
    const h2Request = {
      headers: {
        ":authority": "LOCALHOST:5173",
        "sec-fetch-site": "same-origin",
      },
      rawHeaders: [":method", "GET", ":authority", "LOCALHOST:5173"],
    };
    expect(
      acceptsRealtimeProxyRequest({
        request: h2Request,
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(true);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...h2Request,
          headers: { ...h2Request.headers, ":authority": "attacker.example" },
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...h2Request,
          headers: { ...h2Request.headers, ":authority": "localhost:5173/" },
          rawHeaders: [":method", "GET"],
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...h2Request,
          headers: {
            ...h2Request.headers,
            host: "localhost:5173",
          },
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
    expect(
      acceptsRealtimeProxyRequest({
        request: {
          ...h2Request,
          rawHeaders: [...h2Request.rawHeaders, "host", "localhost:5173"],
        },
        frontendOrigin: "https://localhost:5173",
      }),
    ).toBe(false);
  });

  test("pins HMR websocket handshake to the canonical HTTPS frontend origin", () => {
    expect(
      createLocalViteWebSocketConfiguration({
        frontendOrigin: "https://localhost:5173",
        hmrPort: 5174,
      }),
    ).toEqual({
      host: "127.0.0.1",
      protocol: "wss",
      port: 5174,
      clientPort: 5174,
    });
  });

  test("adds only the validated backend media origin for local development", () => {
    expect(createMediaSourceDirective()).toEqual(["self", "blob:"]);
    expect(createMediaSourceDirective("https://localhost")).toEqual([
      "self",
      "blob:",
      "https://localhost",
    ]);
  });

  test("requires HMR to use a separate port", () => {
    expect(() =>
      createLocalViteWebSocketConfiguration({
        frontendOrigin: "https://localhost:5173",
        hmrPort: 5173,
      }),
    ).toThrow("Local frontend HMR port must differ from its Vite port");
  });

  test("validates local API and HTTPS origins without echoing their values", () => {
    expect(readLocalFrontendServerConfiguration({})).toBeUndefined();
    expect(() =>
      readLocalFrontendServerConfiguration({ [localFrontendMarker]: "true" }),
    ).toThrow("Invalid local frontend Vite configuration");
    expect(
      readLocalFrontendServerConfiguration({
        [localFrontendMarker]: "1",
        [apiBaseUrlKey]: "http://127.0.0.1:3001",
        [originKey]: "https://localhost:5173",
        [localHMRPortKey]: "5174",
        [realtimeOriginKey]: "https://localhost",
      }),
    ).toEqual({
      apiBaseUrl: "http://127.0.0.1:3001",
      frontendOrigin: "https://localhost:5173",
      hmrPort: 5174,
      realtimeOrigin: "https://localhost",
    });

    const sensitiveOrigin = "https://private-token@attacker.example";
    expect(() =>
      readLocalFrontendServerConfiguration({
        [localFrontendMarker]: "1",
        [apiBaseUrlKey]: "http://127.0.0.1:3001",
        [originKey]: sensitiveOrigin,
        [localHMRPortKey]: "5174",
        [realtimeOriginKey]: "https://localhost",
      }),
    ).toThrow("Invalid local frontend Vite configuration");
    try {
      readLocalFrontendServerConfiguration({
        [localFrontendMarker]: "1",
        [apiBaseUrlKey]: "http://127.0.0.1:3001",
        [originKey]: sensitiveOrigin,
        [localHMRPortKey]: "5174",
        [realtimeOriginKey]: "https://localhost",
      });
    } catch (error) {
      expect(String(error)).not.toContain("private-token");
    }
    const sensitiveApiUrl = "http://private-token@attacker.example";
    expect(() =>
      readLocalFrontendServerConfiguration({
        [localFrontendMarker]: "1",
        [apiBaseUrlKey]: sensitiveApiUrl,
        [originKey]: "https://localhost:5173",
        [localHMRPortKey]: "5174",
        [realtimeOriginKey]: "https://localhost",
      }),
    ).toThrow("Invalid local frontend Vite configuration");
    try {
      readLocalFrontendServerConfiguration({
        [localFrontendMarker]: "1",
        [apiBaseUrlKey]: sensitiveApiUrl,
        [originKey]: "https://localhost:5173",
        [localHMRPortKey]: "5174",
        [realtimeOriginKey]: "https://localhost",
      });
    } catch (error) {
      expect(String(error)).not.toContain("private-token");
    }
    expect(() =>
      readLocalFrontendServerConfiguration({
        [localFrontendMarker]: "1",
        [apiBaseUrlKey]: "http://127.0.0.1:3001",
        [originKey]: "https://localhost",
        [localHMRPortKey]: "5174",
        [realtimeOriginKey]: "https://localhost",
      }),
    ).toThrow("Invalid local frontend Vite configuration");
    expect(() =>
      readLocalFrontendServerConfiguration({
        [localFrontendMarker]: "1",
        [apiBaseUrlKey]: "http://127.0.0.1:3001",
        [originKey]: "https://localhost:5173",
        [localHMRPortKey]: "5173",
        [realtimeOriginKey]: "https://localhost",
      }),
    ).toThrow("Invalid local frontend Vite configuration");
  });
});

const availablePort = async () => {
  const listener = createNetServer();
  await new Promise<void>((resolveListen, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolveListen);
  });
  const address = listener.address();
  await new Promise<void>((resolveClose, reject) =>
    listener.close((error) => (error ? reject(error) : resolveClose())),
  );
  if (typeof address !== "object" || address === null)
    throw new Error("Could not reserve a local port for the Vite test");
  return address.port;
};

const listen = async (
  server: ReturnType<typeof createHttpServer>,
  port: number,
) =>
  new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });

const runCurl = async (args: readonly string[]) => {
  const process = Bun.spawn(["curl", ...args], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const [output, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    process.exited,
  ]);
  return { output, exitCode };
};
