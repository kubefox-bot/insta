import { expect, test } from "bun:test";

for (const cleanupFails of [false, true]) {
  test(`actual browser host compensates router setup rejection with cleanup failure=${cleanupFails}`, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        "__tests__/unit/bff-session/browser-host/startup-probe.ts",
        cleanupFails ? "cleanup-fails" : "cleanup-passes",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [code, output, error] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0) throw new Error(`Startup probe failed: ${error}`);
    expect(JSON.parse(output)).toEqual({
      accounts: 2,
      disposals: 1,
      originalPreserved: true,
      cleanupPreserved: cleanupFails,
    });
  });
}
