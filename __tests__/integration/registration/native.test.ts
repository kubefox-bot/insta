import { expect, test } from "bun:test";

test("native Nest registration schema/OpenAPI/Kubb plus SMTP Mailpit observer", async () => {
  const worker = Bun.spawn(
    [process.execPath, "__tests__/integration/registration/native.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, output, error] = await Promise.all([
    worker.exited,
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
  ]);
  if (code) throw new Error(`Native registration probe failed: ${error}`);
  expect(JSON.parse(output)).toEqual({
    nativeRegistration: "passed",
    operationIdBoundary: "passed",
    mailpitObserver: "passed",
    scalarBoundaries: "passed",
    canonicalReplay: "passed",
  });
});
