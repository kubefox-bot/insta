import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { readProbeReport } from "../fixtures/probe-report";

test("HTTP readiness/admission fail closed while liveness remains available; mail degradation is separate", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/infrastructure/readiness-probe.ts"],
    {
      cwd: resolve(import.meta.dir, "../../apps/be-insta"),
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
  expect(readProbeReport(output)).toMatchObject({
    live: 200,
    before: 503,
    beforeBody: { ok: false, error: { code: "DEPENDENCY_UNAVAILABLE" } },
    admission: 503,
    ready: 200,
    readyBody: {
      ok: true,
      data: { status: "ok", mail: "degraded", delivery: "degraded" },
    },
    after: 200,
    oversize: 413,
  });
});
