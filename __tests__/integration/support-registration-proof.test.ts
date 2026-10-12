import { expect, test } from "bun:test";

test("support proof cannot complete real registration and creates no account/session/activation effect", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/support/registration-proof.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe", timeout: 30000 },
  );
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code)
    throw new Error(`Support registration boundary probe failed: ${error}`);
  expect(JSON.parse(output)).toEqual({
    registrationProofRejected: true,
    pendingAccountPreserved: true,
    sessions: 0,
    canonicalActivation: 0,
  });
});
