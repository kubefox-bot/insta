import { expect, test } from "bun:test";
import { correlationSchema } from "@insta/contracts/http";
import { RedisClient } from "bun";
import type { RuntimeDependencies } from "../../apps/be-insta/src/app/composition/runtime/index";
import { connectDependencies } from "../../apps/be-insta/src/app/composition/runtime/index";
import { deliveryStreamsNamespace } from "../../apps/be-insta/src/domains/conversations/server/index";
import {
  connectDragonfly,
  readGeneration,
} from "../../apps/be-insta/src/lib/dragonfly/index";
import { getHealthReady200Schema } from "../../apps/fe-insta/src/lib/api/generated/schemas/getHealthReadySchema";
import { createApiService } from "../../apps/fe-insta/src/lib/api/server/api-service";
import { withHttpServer } from "../compatibility/lib/server";
import { waitUntil } from "../fixtures/barrier";
import { readTestApiConfig, readTestWebConfig } from "../fixtures/environment";
import { readProbeReport } from "../fixtures/probe-report";
import type { TestHttpApplication } from "./types";

test("a healthy dedicated broker connection survives idle beyond connection timeout without polling", async () => {
  const client = await connectDragonfly({
    config: { ...readTestApiConfig().dragonfly, timeoutMs: 100 },
  });
  try {
    const generation = await readGeneration(client);
    // Idle is the scenario: no operation or Compose probe touches this connection.
    await Bun.sleep(350);
    expect(await readGeneration(client)).toBe(generation);
    expect(await client.send("PING", [])).toBe("PONG");
  } finally {
    client.close();
  }
});

test("hung optional mail cannot block required admission or consume the BFF API deadline", async () => {
  const {
    createApplication,
  }: {
    createApplication: (
      readiness: RuntimeDependencies,
    ) => Promise<TestHttpApplication>;
  } = await import(
    new URL("../../apps/be-insta/dist/app/bootstrap.js", import.meta.url)
      .pathname
  );
  const observed = { mailRequests: 0 };
  const mail = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      observed.mailRequests += 1;
      return new Promise<Response>(() => {});
    },
  });
  try {
    const dependencies = await connectDependencies({
      ...readTestApiConfig(),
      mailpitUrl: mail.url.origin,
    });
    try {
      const app = await createApplication(dependencies);
      app
        .getHttpAdapter()
        .get("/core-probe", (_request, response) =>
          response.json({ reached: true }),
        );
      try {
        await app.listen(0, "127.0.0.1");
        const baseURL = await app.getUrl();
        const api = { baseURL, timeoutMs: 1000, maxResponseBytes: 65536 };
        const health = createApiService(api).request({
          execute: () =>
            fetch(`${baseURL}/health/ready`, {
              signal: AbortSignal.timeout(api.timeoutMs),
            }),
          outputSchema: getHealthReady200Schema,
          context: {},
        });
        await waitUntil({ check: async () => observed.mailRequests > 0 });
        const admission = await fetch(`${baseURL}/core-probe`, {
          signal: AbortSignal.timeout(250),
        });
        expect(admission.status).toBe(200);
        const result = await health;
        expect(result.isOk()).toBe(true);
        if (result.isOk()) expect(result.get().mail).toBe("degraded");
        expect(observed.mailRequests).toBe(1);
        const webConfig = readTestWebConfig();
        for (const timeoutMs of new Set([webConfig.api.timeoutMs, 1000]))
          await withHttpServer({
            cwd: new URL("../../apps/fe-insta", import.meta.url).pathname,
            args: [
              "--preload",
              "./dist/observability-preload.js",
              "dist/index.js",
            ],
            path: "/",
            environment: Object.fromEntries([
              ["WEB_MONGO_URL", webConfig.mongo.url],
              ["SESSION_ENCRYPTION_KEY", webConfig.sessionEncryptionKey],
              ["BFF_SOURCE_SIGNING_KEY", webConfig.bffSourceSigningKey],
              ["API_BASE_URL", baseURL],
              ["API_TIMEOUT_MS", String(timeoutMs)],
            ]),
            assertResponse: async (response) => {
              const requestId = crypto.randomUUID();
              const readiness = await fetch(
                new URL("/api/health/ready", response.url),
                {
                  headers: { "X-Request-ID": requestId },
                  signal: AbortSignal.timeout(timeoutMs),
                },
              );
              expect(readiness.status).toBe(200);
              const body = await readiness.json();
              expect(body).toEqual({
                ok: true,
                data: { status: "ok" },
                meta: { requestId },
              });
              expect(correlationSchema.parse(body.meta).requestId).toBe(
                requestId,
              );
              if (timeoutMs === 1000) {
                await dependencies.close();
                const failed = await fetch(
                  new URL("/api/health/ready", response.url),
                  { signal: AbortSignal.timeout(timeoutMs) },
                );
                expect(failed.status).toBe(503);
                const failure = await failed.json();
                const meta = correlationSchema.parse(failure.meta);
                expect(meta.requestId).not.toBe(requestId);
                expect(failed.headers.get("x-request-id")).toBe(meta.requestId);
                expect(failure).toEqual({
                  ok: false,
                  error: {
                    code: "DEPENDENCY_UNAVAILABLE",
                    message: "Required dependency unavailable",
                  },
                  meta,
                });
              }
            },
          });
      } finally {
        await app.close();
      }
    } finally {
      await dependencies.close();
    }
  } finally {
    await mail.stop(true);
  }
}, 15000);

test("required broker deadline closes a blocked connection and settles late rejection without replay", async () => {
  const { createInfrastructureReadiness } = await import(
    "../../apps/be-insta/src/app/health/readiness/index"
  );
  const client = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  const observer = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  try {
    const id = await client.send("CLIENT", ["ID"]);
    const pending = client
      .send("XREAD", [
        "BLOCK",
        "0",
        "STREAMS",
        `fnd04-deadline-${crypto.randomUUID()}`,
        "$",
      ])
      .then(
        () => "resolved",
        () => "cancelled",
      );
    await waitUntil({
      check: async () => {
        const clients: unknown = await observer.send("CLIENT", ["LIST"]);
        return (
          typeof clients === "string" &&
          clients
            .split("\n")
            .some(
              (line) =>
                line.startsWith(`id=${id} `) && / flags=[a-z]*b/.test(line),
            )
        );
      },
    });
    const readiness = createInfrastructureReadiness({
      database: { apiDb: { command: async () => ({ ok: 1 }) } },
      broker: client,
      timeoutMs: 50,
      mailpitUrl: "http://unused.invalid",
      deliveryProbe: {
        authIdentity: (await readGeneration(observer)).slice(0, 40),
        open: () =>
          new RedisClient(readTestApiConfig().deliveryDragonfly.url, {
            autoReconnect: false,
            connectionTimeout: 500,
          }),
        namespace: deliveryStreamsNamespace,
        timeoutMs: 500,
      },
      mailStatus: () => "ok",
    });
    expect(await readiness.checkRequired()).toBe(false);
    expect(await pending).toBe("cancelled");
    await expect(readGeneration(client)).rejects.toThrow();
    expect(await observer.send("PING", [])).toBe("PONG");
  } finally {
    client.close();
    observer.close();
  }
});

test("failed Stories maintenance preserves real Core HTTP admission and reports degradation until recovery", async () => {
  const worker = Bun.spawn(
    [process.execPath, "__tests__/infrastructure/stories-readiness-probe.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, output, error] = await Promise.all([
    worker.exited,
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
  ]);
  expect(code, `${output}\n${error}`).toBe(0);
  expect(readProbeReport(output)).toEqual({
    maintenanceIsolation: "passed",
    recovery: "passed",
    requiredBroker: "fail-closed",
    requiredDatabase: "fail-closed",
  });
});
