import { beforeAll, expect, test } from "bun:test";
import {
  readProcessEnvironment,
  readSyntheticWebConfiguration,
} from "./fixtures/frontend-liveness/config";
import {
  buildFrontend,
  startFrontend,
} from "./fixtures/frontend-liveness/host";

beforeAll(buildFrontend, 30000);

test("exact frontend liveness works before configuration, DB and API acquisition; other paths retain composition", async () => {
  const host = await startFrontend(
    Object.fromEntries([["LOG_LEVEL", "invalid"]]),
  );
  try {
    const live = await fetch(`${host.url}/api/health/live`, {
      signal: AbortSignal.timeout(10000),
    });
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });
    expect(live.headers.get("cache-control")).toBe("no-store");
    for (const path of [
      "/api/health/ready",
      "/api/health/live-extra",
      "/api/health/live/child",
      "/api/users",
    ]) {
      const response = await fetch(`${host.url}${path}`, {
        signal: AbortSignal.timeout(10000),
      });
      expect(response.status, path).toBe(500);
    }
  } finally {
    await host.close();
  }
}, 30000);

test("client-source composition defers configuration until source read and preserves direct-peer policy", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "__tests__/config/fixtures/frontend-liveness/source-probe.ts",
    ],
    {
      env: readProcessEnvironment(),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, error).toBe(0);
  expect(JSON.parse(output)).toEqual({
    imported: true,
    invalidConfigurationRejected: true,
    direct: "127.0.0.1",
    normalized: "127.0.0.1",
    invalid: "unknown",
  });
});

test("production frontend stays live while dependency readiness returns its503 correlation envelope", async () => {
  const host = await startFrontend(readSyntheticWebConfiguration());
  try {
    const requestId = crypto.randomUUID();
    const ready = await fetch(`${host.url}/api/health/ready`, {
      headers: { "X-Request-ID": requestId },
      signal: AbortSignal.timeout(15000),
    });
    expect(ready.status).toBe(503);
    expect(await ready.json()).toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_UNAVAILABLE" },
      meta: { requestId },
    });
    expect(ready.headers.get("x-request-id")).toBe(requestId);
    expect(ready.headers.get("cache-control")).toBe("no-store");
    const live = await fetch(`${host.url}/api/health/live`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });
  } finally {
    await host.close();
  }
}, 30000);
