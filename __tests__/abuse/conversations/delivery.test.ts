import { expect, test } from "bun:test";

test("CHAT-03 delivery ACK and subscription abuse owns actual native cases", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "__tests__/abuse/conversations/delivery.test.ts",
    ],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`CHAT-03 delivery abuse failed: ${out}\n${errors}`);
  expect(errors).toContain("3 pass");
  expect(code).toBe(0);
}, 60000);
