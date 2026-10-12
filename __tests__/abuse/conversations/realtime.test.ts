import { expect, test } from "bun:test";

test("CHAT-03 current membership/auth provider failure cannot leak private pushes and 24KiB is enforced", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/abuse/conversations/realtime.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`CHAT-03 abuse phase failed: ${errors}`);
  expect(JSON.parse(out)).toEqual({
    abuse: "passed",
    membershipRemoved: true,
    actualAuthIoOutage: true,
    noEmitOnAuthFailure: true,
    oversizedTransportClosed: true,
    ownedDeliveryStateRemoved: true,
    foreignDeliveryStatePreserved: true,
  });
});
