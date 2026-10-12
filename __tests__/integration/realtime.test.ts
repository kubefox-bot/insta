import { expect, test } from "bun:test";

test("CHAT-03 real native ticket gateway and private delivery", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/realtime/native.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`CHAT-03 native phase failed: ${errors}`);
  expect(JSON.parse(out)).toEqual({
    realtime: "passed",
    namespaceIsolated: true,
    namespaceCleaned: true,
    canonicalWorkerCannotSeeFixtureEvent: true,
  });
});

test("CHAT-03 actual interrupted Mongo I/O settles sink after bounded cleanup", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/realtime/cancellation.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`CHAT-03 cancellation phase failed: ${errors}`);
  expect(JSON.parse(out)).toEqual({
    cancellation: "passed",
    actualInterruptedOperations: 4,
    allCleanedBefore2000Ms: true,
  });
});

test("CHAT-03 native composition activates scoped outbox and drains before infrastructure", async () => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/integration/realtime/runtime.ts"],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, out, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`CHAT-03 runtime phase failed: ${errors}`);
  expect(JSON.parse(out)).toEqual({
    runtime: "passed",
    workerDeliveryPersisted: true,
    liveRevocation: true,
    closeBeforeInfrastructure: true,
    namespaceIsolated: true,
    namespaceCleaned: true,
  });
});

test("CHAT-03 delivery journal preserves atomic replay, commit ordering and retention on real Mongo", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "__tests__/integration/conversations/delivery-journal.test.ts",
    ],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code)
    throw new Error(
      `CHAT-03 delivery journal phase failed: ${output}\n${errors}`,
    );
  expect(code).toBe(0);
}, 30_000);

test("CHAT-03 expired recovery settles explicitly on real Mongo without publication claims", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "__tests__/integration/conversations/delivery-expiry.test.ts",
    ],
    { cwd: "apps/be-insta", stdout: "pipe", stderr: "pipe" },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code)
    throw new Error(`CHAT-03 delivery expiry failed: ${output}\n${errors}`);
  expect(code).toBe(0);
}, 30000);
