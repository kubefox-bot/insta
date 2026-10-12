import { expect, test } from "bun:test";
import { readGeneration } from "../../apps/be-insta/src/lib/dragonfly/index";
import { waitUntil } from "../fixtures/barrier";
import { createTestEnvironment } from "../fixtures/environment";

test("replica-set atomic commit/rollback, DB credential separation, Lua/Streams and actual app readiness", async () => {
  const env = await createTestEnvironment({
    testRunId: `fnd04-${crypto.randomUUID()}`,
  });
  const { apiDb } = env.api;
  const records = apiDb.collection(env.collection);
  const webRecords = env.web.webDb.collection(env.collection);
  try {
    await records.insertOne({ kind: "fixture" });
    await webRecords.insertOne({ kind: "fixture" });
    const session = env.api.startSession();
    try {
      await session.withTransaction(async () => {
        await records.insertMany([{ kind: "message" }, { kind: "outbox" }], {
          session,
        });
      });
      expect(
        await records.countDocuments({ kind: { $in: ["message", "outbox"] } }),
      ).toBe(2);
      await expect(
        session.withTransaction(async () => {
          await records.insertMany(
            [{ kind: "aborted-message" }, { kind: "aborted-outbox" }],
            { session },
          );
          throw new Error("rollback probe");
        }),
      ).rejects.toThrow("rollback probe");
      expect(await records.countDocuments({ kind: /^aborted/ })).toBe(0);
    } finally {
      await session.endSession();
    }
    await expect(
      apiDb.client.db("insta_web").collection(env.collection).findOne({}),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      env.web.webDb.client
        .db("insta_api")
        .collection(env.collection)
        .findOne({}),
    ).rejects.toMatchObject({ code: 13 });
    const stream = `${env.collection}:stream`;
    env.keys.push(stream);
    expect(await env.broker.send("EVAL", ["return 6 * 7", "0"])).toBe(42);
    await env.broker.send("XGROUP", [
      "CREATE",
      stream,
      "workers",
      "0",
      "MKSTREAM",
    ]);
    const id = await env.broker.send("XADD", [
      stream,
      "*",
      "kind",
      "owned-probe",
    ]);
    expect(typeof id).toBe("string");
    expect(
      await env.broker.send("XREADGROUP", [
        "GROUP",
        "workers",
        "first",
        "COUNT",
        "1",
        "STREAMS",
        stream,
        ">",
      ]),
    ).not.toBeNull();
    const claimed = await env.broker.send("XAUTOCLAIM", [
      stream,
      "workers",
      "second",
      "0",
      "0-0",
      "COUNT",
      "1",
    ]);
    expect(JSON.stringify(claimed)).toContain(String(id));
    expect(await env.broker.send("XACK", [stream, "workers", String(id)])).toBe(
      1,
    );
    const blocking = await env.broker.duplicate();
    const blockingId = await blocking.send("CLIENT", ["ID"]);
    const pending = blocking.send("XREAD", [
      "BLOCK",
      "0",
      "STREAMS",
      stream,
      "$",
    ]);
    const observed = pending.then(
      () => "resolved",
      () => "cancelled",
    );
    try {
      await waitUntil({
        check: async () => {
          const clients: unknown = await env.broker.send("CLIENT", ["LIST"]);
          return (
            typeof clients === "string" &&
            clients
              .split("\n")
              .some(
                (line) =>
                  line.startsWith(`id=${blockingId} `) &&
                  / flags=[a-z]*b/.test(line),
              )
          );
        },
      });
    } finally {
      blocking.close();
    }
    expect(await observed).toBe("cancelled");
    const before = await readGeneration(env.broker);
    expect(before).toMatch(/^[a-f0-9]{40}:/);
    for (const url of [
      `${env.urls.api}/health/ready`,
      `${env.urls.web}/api/health/ready`,
      `${env.urls.mail}/readyz`,
    ])
      expect((await fetch(url)).status).toBe(200);
  } finally {
    await env.dispose();
  }
}, 60000);
