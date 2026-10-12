import { expect, mock } from "bun:test";
import { sourceHeaders } from "@insta/contracts/http";

mock.module("$app/server", () => ({}));
const { createConversationReads } = await import(
  "../../../src/domains/conversations/server/adapters/reads"
);
const { readServerConfig } = await import(
  "../../../src/lib/config/server/index"
);
const item = {
  id: "a".repeat(24),
  participantIds: ["alice", "bob"],
  lastSequence: 10,
  lastActivityAt: 1,
  recipientUsername: "bob",
};
const successBodies = {
  valid: { items: [{ ...item, unreadCount: 2 }], totalUnreadCount: 9 },
  missingTotal: { items: [{ ...item, unreadCount: 2 }] },
  missingItem: { items: [item], totalUnreadCount: 9 },
};
for (const [status, shape] of [
  [200, "valid"],
  [404, "valid"],
  [401, "valid"],
  [403, "valid"],
  [429, "valid"],
  [500, "valid"],
  [200, "missingTotal"],
  [200, "missingItem"],
] as const) {
  const requests: Readonly<{
    path: string;
    authorization: string | null;
    signature: string | null;
  }>[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get("authorization"),
        signature: request.headers.get(sourceHeaders.signature),
      });
      if (status === 404)
        return new Response("old provider HTML not-found", { status });
      if (status === 200)
        return Response.json({
          ok: true,
          data: successBodies[shape],
        });
      return Response.json(
        {
          ok: false,
          error: {
            code: "UPSTREAM_FAILURE",
            message: "Unknown provider failure",
          },
          meta: { requestId: "11111111-1111-4111-8111-111111111111" },
        },
        { status },
      );
    },
  });
  try {
    const config = readServerConfig({
      raw: Object.fromEntries([
        ["API_BASE_URL", `http://127.0.0.1:${server.port}`],
        [
          "WEB_MONGO_URL",
          "mongodb://synthetic:synthetic@127.0.0.1:1/insta_web?authSource=insta_web&replicaSet=rs0",
        ],
        ["SESSION_ENCRYPTION_KEY", "a".repeat(64)],
        ["BFF_SOURCE_SIGNING_KEY", "b".repeat(64)],
      ]),
    });
    const result = await createConversationReads({
      config,
      context: {},
      source: async () => "127.0.0.1",
    }).list("synthetic-token");
    expect(requests.map((request) => request.path)).toEqual([
      "/v1/conversations/unread",
    ]);
    if (status === 200 && shape === "valid") {
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) throw new Error("Expected adapted unread list");
      expect(result.get().totalUnreadCount).toBe(9);
      expect(result.get().items[0]?.unreadCount).toBe(2);
    } else {
      expect(result.isError()).toBe(true);
      if (!result.isError()) throw new Error("Expected upstream failure");
      expect(result.getError()).toEqual(
        status === 200 || status === 404
          ? { code: "DEPENDENCY_UNAVAILABLE", status: 503 }
          : { code: "DEPENDENCY_UNAVAILABLE", status },
      );
    }
    expect(
      requests.every(
        (request) => request.authorization === "Bearer synthetic-token",
      ),
    ).toBe(true);
    expect(requests[0]?.signature).toEqual(expect.any(String));
    expect(requests[0]?.signature).not.toBe("");
  } finally {
    server.stop(true);
  }
}
