import { expect, test } from "bun:test";

test("generated unread SDK signs one request and preserves unavailable responses without legacy fallback", async () => {
  const child = Bun.spawn(
    [process.execPath, "apps/fe-insta/__tests__/receipts/unread-list/probe.ts"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, output + error).toBe(0);
});
