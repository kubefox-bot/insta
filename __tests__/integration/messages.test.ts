import { expect, test } from "bun:test";

test("CHAT-02/A12/A24 real Mongo native send: atomic sequence, actor-global replay and independent canonical identities", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/messages/native.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`CHAT-02 native phase failed: ${error}`);
  expect(JSON.parse(out)).toEqual({
    nativeMessages: "passed",
    concurrent: 10,
    persistedFirst: 1,
    backendOwner: true,
  });
});
