import { expect, test } from "bun:test";

test("CHAT-03 native last event and apply ACK loss recover without next publish", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "__tests__/integration/conversations/delivery-ws.test.ts",
    ],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`CHAT-03 delivery WS failed: ${out}\n${errors}`);
  expect(errors).toContain("1 pass");
  expect(code).toBe(0);
}, 30000);
