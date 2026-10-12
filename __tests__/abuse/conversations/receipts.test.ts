import { expect, test } from "bun:test";

test("receipt authorization rejects mixed and nonmember batches without persisted effects", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "__tests__/abuse/conversations/receipts.test.ts",
    ],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`Receipt abuse phase failed: ${out}\n${error}`);
  expect(code).toBe(0);
}, 30000);
