import { expect, test } from "bun:test";

test("DONE-03 native HTTP shutdown drains handlers before releasing infrastructure", async () => {
  const child = Bun.spawn(
    [process.execPath, "test", "__tests__/integration/shutdown/native.test.ts"],
    {
      cwd: "apps/be-insta",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, out + error).toBe(0);
});

test("DONE-03 real Mongo shutdown retains pending lease/key and reconnect resumes the same event", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/shutdown/outbox.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, out + error).toBe(0);
  expect(JSON.parse(out)).toEqual({
    persistedPending: true,
    sameEventAfterRestart: true,
    boundedSettlement: true,
  });
});
