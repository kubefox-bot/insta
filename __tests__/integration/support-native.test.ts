import { expect, test } from "bun:test";

test("native REST support works without BFF; scoped guest proof cannot authorize; verified session owns report", async () => {
  const worker = Bun.spawn(
    [process.execPath, "__tests__/integration/support/native.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    worker.exited,
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
  ]);
  if (code) throw new Error(`Support native probe failed: ${error}`);
  expect(JSON.parse(out)).toEqual({
    nativeSupport: "passed",
    guestProofNotAccess: "passed",
    sessionActor: "passed",
  });
});
