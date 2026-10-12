import type { RedisClient } from "bun";
import { z } from "zod";
import type { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
export const disposeSupportFixture = async (
  input: Readonly<{
    runId: string;
    generation: string;
    collections: Readonly<Record<string, string>>;
    database: Awaited<ReturnType<typeof connectDatabase>>;
    broker: RedisClient;
    email: Readonly<{ close: () => void }>;
    mail: Readonly<{ dispose: () => Promise<void> }>;
  }>,
) => {
  if (
    !/^support_test_[a-f0-9_]{36}$/.test(input.runId) ||
    Object.values(input.collections).some(
      (name) => !name.startsWith(`${input.runId}_`),
    )
  )
    throw new Error("Refusing foreign support fixture cleanup");
  const removeCollections = async () => {
    const results = await Promise.allSettled(
      Object.values(input.collections).map(async (name) => {
        const collection = input.database.apiDb.collection(name);
        await collection.deleteMany({});
        if (await collection.countDocuments())
          throw new Error("Owned support cleanup failed");
        await collection.drop();
      }),
    );
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length)
      throw new AggregateError(
        failed.map((result) => result.reason),
        "Support collection cleanup failed",
      );
  };
  const removeKeys = async () => {
    const pattern = `auth:${input.generation}:${input.runId}*`;
    for (const key of z
      .array(z.string())
      .parse(await input.broker.send("KEYS", [pattern])))
      await input.broker.del(key);
    if (
      z.array(z.string()).parse(await input.broker.send("KEYS", [pattern]))
        .length
    )
      throw new Error("Owned support Redis cleanup failed");
  };
  const results = await Promise.allSettled([
    input.mail.dispose(),
    removeCollections(),
    removeKeys(),
  ]);
  input.email.close();
  input.broker.close();
  const closed = await Promise.allSettled([input.database.close()]);
  const failures = [...results, ...closed].filter(
    (result) => result.status === "rejected",
  );
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Support fixture cleanup failed",
    );
};
