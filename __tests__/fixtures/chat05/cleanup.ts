import { createHmac } from "node:crypto";
import type { RedisClient } from "bun";
import { z } from "zod";
import { collections } from "../../../apps/be-insta/src/domains/conversations/adapters/mongo/conts";
import { receiptCollections } from "../../../apps/be-insta/src/domains/conversations/adapters/mongo/receipts/conts";
import { readGeneration } from "../../../apps/be-insta/src/lib/dragonfly/index";
import type { createBffEnvironment } from "../bff-session/environment";
import type { readTestApiConfig } from "../environment";

const removeConversations = async (
  fixture: Awaited<ReturnType<typeof createBffEnvironment>>,
  ids: readonly string[],
) => {
  const conversations = await fixture.native.db
    .collection(collections.conversations)
    .find({ participantIds: { $in: ids } })
    .toArray();
  const conversationIds = conversations.map(({ _id }) => _id.toHexString());
  for (const name of [
    collections.messages,
    collections.events,
    collections.identities,
    collections.outbox,
    receiptCollections.receipts,
    receiptCollections.outbox,
  ]) {
    await fixture.native.db
      .collection(name)
      .deleteMany({ conversationId: { $in: conversationIds } });
    if (
      await fixture.native.db
        .collection(name)
        .countDocuments({ conversationId: { $in: conversationIds } })
    )
      throw new Error("Owned chat cleanup incomplete");
  }
  await fixture.native.db
    .collection(collections.conversations)
    .deleteMany({ _id: { $in: conversations.map(({ _id }) => _id) } });
};
const removeQuotas = async ({
  fixture,
  ids,
  broker,
  config,
  keys,
}: Readonly<{
  fixture: Awaited<ReturnType<typeof createBffEnvironment>>;
  ids: readonly string[];
  broker: RedisClient;
  config: ReturnType<typeof readTestApiConfig>;
  keys: Set<string>;
}>) => {
  const generation = await readGeneration(broker);
  const digest = (subject: string) =>
    createHmac("sha256", Buffer.from(config.authLimitsKey, "hex"))
      .update(subject)
      .digest("hex");
  const bindings = await fixture.web.webDb
    .collection("bff_sessions")
    .find({ "user.id": { $in: ids } })
    .toArray();
  for (const binding of bindings)
    keys.add(
      `auth:${generation}:realtime:limit:${digest(z.string().parse(binding.backendSessionId))}`,
    );
  for (const id of ids)
    for (const namespace of [
      "directory",
      "conversations",
      "message.send",
      "receipts",
    ])
      keys.add(`auth:${generation}:${namespace}:limit:${digest(id)}`);
  for (const key of keys) {
    await broker.del(key);
    if (await broker.get(key))
      throw new Error("Owned quota cleanup incomplete");
  }
};
export const cleanupChatFixture = async (
  input: Readonly<{
    fixture: Awaited<ReturnType<typeof createBffEnvironment>>;
    broker?: RedisClient;
    config: ReturnType<typeof readTestApiConfig>;
    keys: Set<string>;
  }>,
) => {
  const users = await input.fixture.native.db
    .collection("users")
    .find({ emailKey: { $regex: `^${input.fixture.native.runId}-` } })
    .toArray();
  const ids = users.map(({ _id }) => _id.toHexString());
  const outcomes = await Promise.allSettled([
    removeConversations(input.fixture, ids),
    input.broker
      ? removeQuotas({ ...input, broker: input.broker, ids })
      : Promise.resolve(),
  ]);
  const failures = outcomes
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length)
    throw new AggregateError(failures, "Owned CHAT05 cleanup failed");
};
