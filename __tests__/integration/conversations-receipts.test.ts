import { expect, test } from "bun:test";

test("recipient receipts preserve atomic Mongo state, native REST/WS and publication recovery", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "__tests__/integration/conversations/receipts.test.ts",
      "__tests__/integration/conversations/receipts-http.test.ts",
      "__tests__/integration/conversations/receipts-ws.test.ts",
      "__tests__/integration/conversations/receipts-lifecycle.test.ts",
    ],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`Receipt native phase failed: ${out}\n${error}`);
  expect(code).toBe(0);
}, 60000);
