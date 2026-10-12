import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("native backend config proves Nest/Pino HTTP context under Bun", async () => {
  const child = Bun.spawn(
    [process.execPath, "test", "__tests__/observability", "--timeout", "10000"],
    {
      cwd: resolve(import.meta.dir, "../../apps/be-insta"),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, stdout + stderr).toBe(0);
  expect(stderr).toContain("1 pass");
  expect(stdout + stderr).not.toContain("CANARY");
}, 20000);
