import { expect, test } from "bun:test";
import { z } from "zod";
import {
  connectDragonfly,
  readGeneration,
} from "../../apps/be-insta/src/lib/dragonfly/index";
import {
  cancelIntent,
  createDragonflyIntents,
  createIntent,
  resolveResume,
} from "../../apps/fe-insta/src/domains/auth-continuation/server/index";
import { readTestApiConfig } from "../fixtures/environment";
import { requireSuccess } from "../fixtures/outcome";

test("real Dragonfly reload/CAS isolates selected intents, context, actor and deadline without content", async () => {
  const client = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  const generation = await readGeneration(client);
  const namespace = `auth05_${crypto.randomUUID().replaceAll("-", "")}`;
  const intents = createDragonflyIntents({ client, generation, namespace });
  const now = Date.now();
  const ids: string[] = [];
  const make = async (recipientId: string) => {
    const result = await createIntent(
      {
        input: {
          type: "compose_message",
          recipientId,
          operationId: crypto.randomUUID(),
        },
        context: "protected-context",
        now,
        registrationExpiresAt: now + 60000,
      },
      {
        intents,
        uuid: () => {
          const id = crypto.randomUUID();
          ids.push(id);
          return id;
        },
      },
    );
    expect(result.isOk()).toBe(true);
    return requireSuccess(result).intentId;
  };
  try {
    const first = await make("recipient-one");
    const second = await make("recipient-two");
    const reloaded = createDragonflyIntents({ client, generation, namespace });
    const before = await reloaded.find(first);
    expect(before?.recipientId).toBe("recipient-one");
    expect(before?.expiresAt).toBe(now + 60000);
    const raw = await client.get(`auth:${generation}:${namespace}:${first}`);
    expect(raw).not.toContain("messageText");
    expect(raw).not.toContain("Blob");
    const targets = {
      resolve: async ({
        intent,
      }: Parameters<
        import("../../apps/fe-insta/src/domains/auth-continuation/server/index").Targets["resolve"]
      >[0]) => ({
        type: "compose_message" as const,
        conversationId: `chat-${intent.recipientId}`,
      }),
    };
    const input = {
      intentId: first,
      context: "protected-context",
      actor: { userId: "actor", generation: "S1" },
      now: now + 1,
    };
    expect(
      (
        await resolveResume(
          { ...input, context: "foreign" },
          { intents: reloaded, targets },
        )
      ).isError(),
    ).toBe(true);
    const results = await Promise.all([
      resolveResume(input, { intents: reloaded, targets }),
      resolveResume(input, { intents: reloaded, targets }),
    ]);
    expect(results.filter((result) => result.isOk()).length).toBe(1);
    expect(
      requireSuccess(
        await resolveResume(input, { intents: reloaded, targets }),
      ),
    ).toEqual({
      type: "compose_message",
      conversationId: "chat-recipient-one",
    });
    expect(
      (
        await resolveResume(
          { ...input, actor: { userId: "other", generation: "S2" } },
          { intents: reloaded, targets },
        )
      ).isError(),
    ).toBe(true);
    expect(
      (
        await resolveResume(
          { ...input, now: now + 60000 },
          { intents: reloaded, targets },
        )
      ).isError(),
    ).toBe(true);
    expect(
      (
        await cancelIntent(
          { intentId: second, context: "protected-context", now: now + 2 },
          { intents: reloaded },
        )
      ).isOk(),
    ).toBe(true);
    expect((await reloaded.find(second))?.state).toBe("cancelled");
    expect((await reloaded.find(first))?.expiresAt).toBe(now + 60000);
  } finally {
    for (const id of ids)
      await client.del(`auth:${generation}:${namespace}:${id}`);
    expect(
      z
        .array(z.string())
        .parse(
          await client.send("KEYS", [`auth:${generation}:${namespace}:*`]),
        ),
    ).toEqual([]);
    client.close();
  }
});
