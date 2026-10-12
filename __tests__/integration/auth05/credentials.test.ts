import { expect, test } from "bun:test";
import { readProbeReport } from "../../fixtures/probe-report";

test("A02 native wrong audience/signature and registration proof reject before persisted effects", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/auth/credentials.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe", timeout: 60000 },
  );
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`Credential probe failed: ${error}`);
  expect(readProbeReport(output)).toEqual({
    nativeCredentialBoundary: "passed",
    persistedEffectChanges: 0,
  });
});
