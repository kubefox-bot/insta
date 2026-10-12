import { expect, test } from "bun:test";

test("real standalone Nest auth has native login/refresh/logout/revoke/me and scalar input parity", async () => {
  const worker = Bun.spawn(
    [process.execPath, "__tests__/integration/auth/native.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    worker.exited,
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
  ]);
  if (code) throw new Error(`Native API probe failed: ${error}`);
  expect(JSON.parse(out)).toEqual({
    nativeAuth: "passed",
    scalarBoundaries: "passed",
    malformedUtf8: "passed",
  });
});
