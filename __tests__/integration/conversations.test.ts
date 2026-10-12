import { expect, test } from "bun:test";

test("CHAT-01 real Mongo and native backend: single pair, membership, bounded history and early-timestamp late commit", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/conversations/native.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`CHAT-01 native provider phase failed: ${error}`);
  expect(JSON.parse(out)).toEqual({
    nativeChat: "passed",
    pairRace: 12,
    canonicalCreated: 1,
    lateCommitSequence: 121,
    heldWatermark: 120,
    backendOwner: true,
  });
});

test("CHAT-01 reordered messages preserve monotonic activity and original timestamps", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "__tests__/integration/conversations/activity.test.ts",
    ],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code)
    throw new Error(`Conversation activity phase failed: ${out}\n${error}`);
  expect(code).toBe(0);
}, 60000);
