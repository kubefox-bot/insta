import { expect, test } from "bun:test";

test("actual Nest multipart boundary denies header-only anonymous upload and preserves canonical replay", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/stories/http.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`Stories native boundary failed: ${error}`);
  expect(JSON.parse(out)).toEqual({
    nativePublication: "passed",
    headersOnlyAuthDenial: true,
    oneCanonical: true,
    trailingFileRejected: true,
    finiteUploadAdmission: true,
  });
}, 30_000);
