import { expect, test } from "bun:test";

test("Stories backend correlation, privacy and upload admission regressions", async () => {
  const child = Bun.spawn(
    [process.execPath, "test", "./__tests__/unit/stories-backend/probe.ts"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [status, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(status, out + error).toBe(0);
});
