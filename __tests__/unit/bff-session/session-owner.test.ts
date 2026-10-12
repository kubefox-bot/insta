import { expect, test } from "bun:test";

const probe = async (scenario: string) => {
  const child = Bun.spawn(
    [
      process.execPath,
      "__tests__/unit/bff-session/session-owner/probe.ts",
      scenario,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, out + error).toBe(0);
  return JSON.parse(out);
};
test("failed startup preserves its error and a delayed admitted request cannot reacquire or start a worker after close", async () => {
  expect(await probe("failed-startup")).toMatchObject({
    initial: { kind: "rejected", original: true },
    delayed: "rejected",
    acquisitions: 1,
    starts: 0,
    stops: 0,
    claimsAfterStop: 0,
    infrastructure: 1,
    prematureRelease: false,
  });
});
for (const phase of ["database-await", "indexes-await"]) {
  test(`successful ${phase} crossing stop never creates a worker or returns an authorized request`, async () => {
    expect(await probe(phase)).toMatchObject({
      crossing: "rejected",
      acquisitions: 1,
      starts: 0,
      stops: 0,
      claims: 0,
      infrastructure: 1,
      prematureRelease: false,
    });
  });
}
test("ready-store request crossing shutdown is rejected and infrastructure waits for actual existing worker settlement", async () => {
  expect(await probe("ready-await")).toMatchObject({
    first: "ready",
    crossing: "rejected",
    acquisitions: 1,
    starts: 1,
    stops: 1,
    claimsAfterStop: 0,
    held: { infrastructure: 0, lookupActive: true },
    infrastructure: 1,
    prematureRelease: false,
  });
});
test("normal requests reuse one store and worker before stop, then drain it before infrastructure", async () => {
  expect(await probe("normal")).toMatchObject({
    first: "ready",
    crossing: "ready",
    acquisitions: 1,
    starts: 1,
    stops: 1,
    claimsAfterStop: 0,
    held: { infrastructure: 0, lookupActive: true },
    infrastructure: 1,
    prematureRelease: false,
  });
});
