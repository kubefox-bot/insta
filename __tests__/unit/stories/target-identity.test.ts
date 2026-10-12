import { expect, spyOn, test } from "bun:test";
import { resolveContinuation } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/index";
import { resolveStoryTarget } from "../../../apps/fe-insta/src/domains/stories/server/targets/index";

test("verified but inactive identity and disabled stories cannot produce ready targets", async () => {
  const actor = { userId: "owner", generation: "S1" };
  const input = {
    actor,
    type: "create_story" as const,
    operationId: crypto.randomUUID(),
  };
  for (const identity of [
    { status: "pending", actor },
    { status: "guest", actor: null },
    { status: "authenticated", actor: { ...actor, generation: "old" } },
    { status: "authenticated", actor: { ...actor, userId: "foreign" } },
  ])
    expect(
      await resolveStoryTarget(input, {
        available: true,
        readIdentity: async () => identity,
      }),
    ).toBeUndefined();
  expect(
    await resolveStoryTarget(input, {
      available: false,
      readIdentity: async () => ({ status: "authenticated", actor }),
    }),
  ).toBeUndefined();
  expect(
    await resolveStoryTarget(input, {
      available: true,
      readIdentity: async () => ({ status: "authenticated", actor }),
    }),
  ).toEqual({ type: "create_story", operationId: input.operationId });
});

test("browser transport accepts only the matching discriminated story wire target", async () => {
  const operationId = crypto.randomUUID();
  const fetcher = spyOn(globalThis, "fetch");
  try {
    for (const data of [
      { type: "create_story", operationId },
      { type: "resume_story", operationId },
    ] as const) {
      fetcher.mockResolvedValueOnce(Response.json({ ok: true, data }));
      expect(await resolveContinuation(crypto.randomUUID())).toEqual(data);
    }
    for (const data of [
      { type: "create_story", conversationId: "wrong" },
      { type: "resume_story", operationId: "https://foreign.test" },
      { type: "create_story", operationId, previewId: "private" },
      { type: "compose_message", operationId },
    ]) {
      fetcher.mockResolvedValueOnce(Response.json({ ok: true, data }));
      expect(await resolveContinuation(crypto.randomUUID())).toBeUndefined();
    }
  } finally {
    fetcher.mockRestore();
  }
});
