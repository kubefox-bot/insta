import { expect, test } from "bun:test";

test("generated receipt SDK adapts signed native REST responses and preserves upstream failures", async () => {
  const child = Bun.spawn(
    [process.execPath, "apps/fe-insta/__tests__/receipts/backend/probe.ts"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, output + error).toBe(0);
});
