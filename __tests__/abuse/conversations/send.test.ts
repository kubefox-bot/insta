import { expect, test } from "bun:test";

test("CHAT-02/A13 Mongo persisted response loss and per-sink outbox crash recovery without stream hints", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/messages/recovery.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`CHAT-02 recovery phase failed: ${error}`);
  expect(JSON.parse(out)).toEqual({
    nativeRecovery: "passed",
    persisted: 1,
    stableEventIds: 1,
    independentSinks: true,
    backendOwner: true,
  });
});
