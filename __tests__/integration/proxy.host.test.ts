import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { io } from "socket.io-client";
import { z } from "zod";
import { createApiService } from "../../apps/fe-insta/src/lib/api/server/api-service";
import { readInfraConfig } from "../../scripts/infra/config";
import { cleanupResources } from "../../scripts/testing/cleanup";
import type { OwnedResource } from "../../scripts/testing/types";
import { waitUntil } from "../fixtures/barrier";
import { docker } from "../fixtures/docker";

const certificate = await Bun.file(
  new URL("../../infra/certs/localhost.crt", import.meta.url),
).text();
const pollingProbe = async (url: string) => {
  const socket = io(url, {
    path: "/event",
    transports: ["polling"],
    ca: certificate,
    reconnection: false,
    timeout: 5000,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    expect(await socket.timeout(5000).emitWithAck("probe")).toBe(
      "real-socket-io",
    );
    expect(socket.io.engine.transport.name).toBe("polling");
  } finally {
    socket.disconnect();
  }
};
// lib.dom shadows Buns TLS constructor overload. Runtime support is exercised here.
const NativeWebSocket = WebSocket as typeof WebSocket & {
  new (url: string, options: Bun.WebSocketOptions): WebSocket;
};
const upgradeProbe = async (url: string) => {
  const handshake = await fetch(`${url}/event/?EIO=4&transport=polling`, {
    tls: { ca: certificate },
  });
  const { sid } = JSON.parse((await handshake.text()).slice(1));
  const socket = new NativeWebSocket(
    `${url.replace("https:", "wss:")}/event/?EIO=4&transport=websocket&sid=${sid}`,
    { tls: { ca: certificate } },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("WebSocket upgrade deadline")),
        5000,
      );
      socket.onopen = () => socket.send("2probe");
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WebSocket upgrade failed"));
      };
      socket.onmessage = ({ data }) => {
        if (data === "3probe") {
          socket.send("5");
          socket.send("40");
        } else if (String(data).startsWith("40")) {
          socket.send(`421["probe"]`);
        } else if (data === `431["real-socket-io"]`) {
          clearTimeout(timer);
          resolve();
        }
      };
    });
  } finally {
    socket.close();
  }
};
test("production Traefik routing preserves /event poll and upgrade, /eventual frontend, TCP and non-JSON errors", async () => {
  const name = `insta-fnd04-${crypto.randomUUID()}`;
  const network = name;
  const fixture = `${name}-fixture`;
  const proxy = `${name}-proxy`;
  const root = resolve(import.meta.dir, "../..");
  const networkId = await docker(
    "network",
    "create",
    "--label",
    `insta.testRunId=${name}`,
    network,
  );
  const resources: OwnedResource[] = [{ kind: "network", id: networkId }];
  try {
    const fixtureId = await docker(
      "run",
      "-d",
      "--name",
      fixture,
      "--label",
      `insta.testRunId=${name}`,
      "--network",
      network,
      "--network-alias",
      "be-insta",
      "--network-alias",
      "fe-insta",
      `${readInfraConfig().project}-testhost`,
      "bun",
      "__tests__/fixtures/transport.ts",
    );
    resources.push({ kind: "container", id: fixtureId });
    const proxyId = await docker(
      "run",
      "-d",
      "--name",
      proxy,
      "--label",
      `insta.testRunId=${name}`,
      "--network",
      network,
      "-p",
      "127.0.0.1::443",
      "-v",
      `${root}/infra/traefik/static.yml:/etc/traefik/traefik.yml:ro`,
      "-v",
      `${root}/infra/traefik/dynamic.yml:/etc/traefik/dynamic.yml:ro`,
      "-v",
      `${root}/infra/certs:/certs:ro`,
      "traefik:v3.5.4@sha256:4df0a50fcf71b454c0d7ad17675776dc8d37359deae3291895bdaa008c1b9972",
    );
    resources.push({ kind: "container", id: proxyId });
    const port = (await docker("port", proxy, "443/tcp")).split(":").at(-1);
    const url = `https://localhost:${port}`;
    const get = (path: string) =>
      fetch(`${url}${path}`, {
        tls: { ca: certificate },
        signal: AbortSignal.timeout(1000),
      });
    await waitUntil({
      check: async () => {
        try {
          return (await get("/")).ok;
        } catch {
          return false;
        }
      },
    });
    expect(await (await get("/eventual")).text()).toBe("frontend fixture");
    const polling = await get("/event/?EIO=4&transport=polling");
    expect(polling.status).toBe(200);
    expect((await polling.text()).startsWith("0{")).toBe(true);
    expect(polling.headers.get("cache-control")).toBe("no-store");
    await pollingProbe(url);
    await upgradeProbe(url);
    const tcp = Bun.spawn(
      [
        "curl",
        "--silent",
        "--show-error",
        "--http1.1",
        "--cacert",
        `${root}/infra/certs/localhost.crt`,
        `${url}/`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(await tcp.exited).toBe(0);
    expect(await new Response(tcp.stdout).text()).toBe("frontend fixture");
    await docker("stop", fixture);
    const failure = await get("/api/health/ready");
    expect(failure.status).toBe(502);
    expect(failure.headers.get("content-type") ?? "").not.toContain(
      "application/json",
    );
    const result = await createApiService({
      timeoutMs: 1000,
      maxResponseBytes: 1024,
    }).request({
      execute: async () => failure,
      outputSchema: z.never(),
      context: {},
    });
    expect(result.isError()).toBe(true);
    if (result.isError())
      expect(result.getError().kind).toBe("invalid_contract");
  } finally {
    await cleanupResources({ testRunId: name, resources, execute: docker });
  }
}, 60000);
