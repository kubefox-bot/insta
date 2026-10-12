import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  secureDirectory,
  writePrivateFile,
} from "../../scripts/infra/artifacts";
import { readComposeFiles, readInfraConfig } from "../../scripts/infra/config";
import { cleanupResources } from "../../scripts/testing/cleanup";
import type { OwnedResource } from "../../scripts/testing/types";
import { waitUntil } from "../fixtures/barrier";
import { docker } from "../fixtures/docker";

const brokerImage =
  "docker.dragonflydb.io/dragonflydb/dragonfly:v1.34.2@sha256:d5312167ab5125f916218e71994323800926038eb284e2da8ed41d47e9c2b44e";
const proxyImage =
  "traefik:v3.5.4@sha256:4df0a50fcf71b454c0d7ad17675776dc8d37359deae3291895bdaa008c1b9972";
test("routed auth and canonical writes survive startup outage and delivery-only cold restore", async () => {
  const runId = "insta-chat03-" + crypto.randomUUID();
  const project = readInfraConfig().project;
  const resources: OwnedResource[] = [];
  const own = async (args: string[]) => {
    const id = await docker(...args);
    resources.push({ kind: "container", id });
    return id;
  };
  const labels = (name: string) => [
    "--name",
    name,
    "--label",
    "insta.testRunId=" + runId,
  ];
  const api = runId + "-api",
    web = runId + "-web",
    proxy = runId + "-proxy",
    auth = runId + "-auth",
    delivery = runId + "-delivery";
  const directory = resolve(".infra/delivery-isolation", runId);
  await secureDirectory(directory);
  const overlay = directory + "/network.json";
  await writePrivateFile({
    path: overlay,
    content: JSON.stringify({
      services: {
        testhost: { networks: ["default", "delivery-isolation"] },
        "fe-insta": { networks: ["default", "delivery-isolation"] },
      },
      networks: { "delivery-isolation": { external: true, name: runId } },
    }),
  });
  const composeRun = [
    "compose",
    "--project-name",
    project,
    ...readComposeFiles().flatMap((path) => ["-f", path]),
    "-f",
    overlay,
    "run",
    "-d",
    "--no-deps",
  ];
  try {
    const network = await docker(
      "network",
      "create",
      "--label",
      "insta.testRunId=" + runId,
      runId,
    );
    resources.push({ kind: "network", id: network });
    for (const [name, memory] of [
      [auth, "256mb"],
      [delivery, "1gb"],
    ])
      await own([
        "run",
        "-d",
        ...labels(name),
        "--network",
        runId,
        "--memory",
        name === delivery ? "1536m" : "512m",
        brokerImage,
        "--proactor_threads=1",
        "--maxmemory=" + memory,
        "--requirepass=isolated-synthetic",
        "--logtostderr",
      ]);
    await docker("stop", delivery);
    const apiId = await own([
      ...composeRun,
      ...labels(api),
      "-p",
      "127.0.0.1::3002",
      "--env",
      "STORIES_MODE=disabled",
      "--env",
      "DRAGONFLY_URL=redis://:isolated-synthetic@" + auth + ":6379",
      "--env",
      "DELIVERY_DRAGONFLY_URL=redis://:isolated-synthetic@" +
        delivery +
        ":6379",
      "testhost",
      "bun",
      "--cwd",
      "apps/be-insta",
      "__tests__/fixtures/delivery/isolation-api.ts",
    ]);
    const controlPort = (await docker("port", apiId, "3002/tcp"))
      .split(":")
      .at(-1);
    const control = "http://127.0.0.1:" + controlPort;
    await waitUntil({
      timeoutMs: 30000,
      check: () =>
        fetch(control + "/accounts").then(
          async (r) => {
            await r.body?.cancel();
            return r.ok;
          },
          () => false,
        ),
    });
    const setup = await (await fetch(control + "/accounts")).json();
    const generation = await (await fetch(control + "/auth-generation")).json();
    const dynamic = directory + "/dynamic.yml";
    await writePrivateFile({
      path: dynamic,
      content: JSON.stringify({
        http: {
          routers: {
            native: {
              rule: "PathPrefix(`/native/`)",
              priority: 10,
              service: "native",
              middlewares: ["strip"],
              entryPoints: ["probe"],
              tls: {},
            },
            web: {
              priority: 1,
              rule: "PathPrefix(`/`)",
              service: "web",
              entryPoints: ["probe"],
              tls: {},
            },
          },
          services: {
            native: {
              loadBalancer: { servers: [{ url: "http://" + api + ":3001" }] },
            },
            web: {
              loadBalancer: { servers: [{ url: "http://" + web + ":3000" }] },
            },
          },
          middlewares: { strip: { stripPrefix: { prefixes: ["/native"] } } },
        },
        tls: {
          certificates: [
            {
              certFile: "/certs/localhost.crt",
              keyFile: "/certs/localhost.key",
            },
          ],
        },
      }),
    });
    const proxyId = await own([
      "run",
      "-d",
      ...labels(proxy),
      "--network",
      runId,
      "-p",
      "127.0.0.1::8443",
      "-v",
      dynamic + ":/source.yml:ro",
      "-v",
      resolve("infra/certs") + ":/certs:ro",
      proxyImage,
      "--entrypoints.probe.address=:8443",
      "--providers.file.filename=/source.yml",
      "--log.level=ERROR",
    ]);
    const port = (await docker("port", proxyId, "8443/tcp")).split(":").at(-1);
    const origin = "https://localhost:" + port;
    await own([
      ...composeRun,
      ...labels(web),
      "--env",
      "STORIES_MODE=disabled",
      "--env",
      "HOST=0.0.0.0",
      "--env",
      "PORT=3000",
      "--env",
      "API_BASE_URL=http://" + api + ":3001",
      "--env",
      "ORIGIN=" + origin,
      "--env",
      "TRUSTED_WEB_PROXY_HOST=" + proxy,
      "fe-insta",
    ]);
    const request = (path: string, options: RequestInit = {}) =>
      fetch(origin + path, { ...options, tls: { rejectUnauthorized: false } });
    await waitUntil({
      timeoutMs: 30000,
      check: () =>
        request("/api/health/live").then(
          async (r) => {
            await r.body?.cancel();
            return r.ok;
          },
          () => false,
        ),
    });
    const post = (
      path: string,
      body: unknown,
      cookie?: string,
      actor?: { userId: string; generation: string },
    ) =>
      request(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          ...(cookie ? { cookie } : {}),
          ...(actor
            ? {
                "X-Expected-Owner-ID": actor.userId,
                "X-Expected-Login-Generation": actor.generation,
              }
            : {}),
          "x-operation-id": crypto.randomUUID(),
          "x-idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
    const health = await request("/native/health/ready");
    expect(health.status).toBe(200);
    expect((await health.json()).data.delivery).toBe("degraded");
    const login = await post("/api/auth/login", setup.accounts[0]);
    expect(login.status).toBe(200);
    await login.body?.cancel();
    const cookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith("insta_session="))
      ?.split(";")[0];
    if (!cookie) throw Error("Login cookie absent");
    const session = await request("/api/session", { headers: { cookie } });
    expect(session.status).toBe(200);
    const actor = (await session.json()).data;
    const pair = await post(
      "/api/conversations",
      { recipientId: setup.ids[1] },
      cookie,
      actor,
    );
    if (pair.status !== 200)
      throw new Error(
        "Conversation failed: " + JSON.stringify(await pair.json()),
      );
    expect(pair.status).toBe(200);
    const conversationId = (await pair.json()).data.conversation.id;
    const send = await post(
      "/api/conversations/" + conversationId + "/messages",
      {
        text: "delivery outage persisted",
        clientMessageId: crypto.randomUUID(),
      },
      cookie,
      actor,
    );
    expect(send.status).toBe(200);
    await send.body?.cancel();
    expect((await (await fetch(control + "/count")).json()).messages).toBe(1);
    await docker("start", delivery);
    await waitUntil({
      check: () =>
        fetch(control + "/bootstrap").then(
          async (r) => {
            await r.body?.cancel();
            return r.ok;
          },
          () => false,
        ),
    });
    const healthy = await request("/native/health/ready");
    expect((await healthy.json()).data.delivery).toBe("ok");
    expect((await (await fetch(control + "/delivery-ping")).json()).pong).toBe(
      "PONG",
    );
    const ticketResponse = await post(
      "/api/realtime/ticket",
      {},
      cookie,
      actor,
    );
    expect(ticketResponse.status).toBe(200);
    const ticket = (await ticketResponse.json()).data.ticket;
    await docker("restart", delivery);
    await waitUntil({
      check: () =>
        request("/native/health/ready").then(
          async (r) => (await r.json()).data.delivery === "degraded",
          () => false,
        ),
    });
    const during = await post("/api/auth/login", setup.accounts[1]);
    expect(during.status).toBe(200);
    await during.body?.cancel();
    const consumed = await fetch(control + "/consume", {
      method: "POST",
      body: JSON.stringify({ ticket }),
    });
    expect((await consumed.json()).consumed).toBe(true);
    expect(await (await fetch(control + "/auth-generation")).json()).toEqual(
      generation,
    );
    await waitUntil({
      check: () =>
        fetch(control + "/bootstrap").then(
          async (r) => {
            await r.body?.cancel();
            return r.ok;
          },
          () => false,
        ),
    });
    expect((await (await fetch(control + "/delivery-ping")).json()).pong).toBe(
      "PONG",
    );
    const bffReady = await request("/api/health/ready");
    expect(bffReady.status).toBe(200);
    await bffReady.body?.cancel();
  } catch (error) {
    for (const service of [api, web]) {
      const logs = await docker("logs", service).catch(() => "");
      process.stderr.write(
        logs.replace(/(?:redis|mongodb):\/\/[^\s]+/g, "[redacted-provider]"),
      );
    }
    throw error;
  } finally {
    await docker("stop", "--time", "15", api).catch(() => undefined);
    await cleanupResources({ testRunId: runId, resources, execute: docker });
  }
}, 120000);
