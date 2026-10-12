import { expect, test } from "bun:test";
import { createConversationTransport } from "../../../apps/fe-insta/src/domains/conversations/browser/index";

test("browser transport pins expected owner/login generation, validates CSP-safe output, preserves forbidden as failure", async () => {
  const actor = { userId: "owner", generation: "login" };
  const request: NonNullable<
    Parameters<typeof createConversationTransport>[0]["request"]
  > = async (input, init) => {
    expect(new Headers(init?.headers).get("X-Expected-Owner-ID")).toBe("owner");
    expect(new Headers(init?.headers).get("X-Expected-Login-Generation")).toBe(
      "login",
    );
    expect(String(input)).toContain("after=7");
    return Response.json({
      ok: true,
      data: {
        items: [],
        baselineCursor: 7,
        watermark: 7,
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });
  };
  expect(
    (
      await createConversationTransport({ actor, request }).history({
        conversationId: "c",
        after: 7,
      })
    ).baselineCursor,
  ).toBe(7);
  const denied: NonNullable<
    Parameters<typeof createConversationTransport>[0]["request"]
  > = async () =>
    Response.json(
      { ok: false, error: { code: "CONVERSATION_FORBIDDEN" } },
      { status: 403 },
    );
  await expect(
    createConversationTransport({ actor, request: denied }).history({
      conversationId: "c",
    }),
  ).rejects.toThrow("CONVERSATION_FORBIDDEN");
  const invalid: NonNullable<
    Parameters<typeof createConversationTransport>[0]["request"]
  > = async () =>
    Response.json({
      ok: true,
      data: {
        items: [{ text: "missing identity" }],
        baselineCursor: 0,
        watermark: 1,
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });
  await expect(
    createConversationTransport({ actor, request: invalid }).history({
      conversationId: "c",
    }),
  ).rejects.toThrow();
});
