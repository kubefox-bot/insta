import { expect, mock, spyOn } from "bun:test";
import { sourceHeaders } from "@insta/contracts/http";

mock.module("$app/server", () => ({}));
const { createReceiptBackend } = await import(
  "../../../src/domains/conversations/server/receipts/adapters/backend"
);
const { readServerConfig } = await import(
  "../../../src/lib/config/server/index"
);
const conversationId = "c".repeat(24);
const backend = createReceiptBackend({
  config: readServerConfig({
    raw: Object.fromEntries([
      ["API_BASE_URL", "http://local.test:3001"],
      [
        "WEB_MONGO_URL",
        "mongodb://synthetic:synthetic@local.test/insta_web?authSource=insta_web&replicaSet=rs0",
      ],
      ["SESSION_ENCRYPTION_KEY", "a".repeat(64)],
      ["BFF_SOURCE_SIGNING_KEY", "b".repeat(64)],
    ]),
  }),
  context: { requestId: "11111111-1111-4111-8111-111111111111" },
  source: async () => "127.0.0.1",
});
const snapshot = {
  conversationId,
  receipts: [
    {
      messageId: "m",
      recipientId: "alice",
      sequence: 1,
      deliveredAt: "2026-10-11T10:00:00.000Z",
      readAt: null,
    },
  ],
};
const input = {
  accessToken: "synthetic-token",
  conversationId,
  payload: { messageIds: ["m"], status: "delivered" as const },
};
const expectedFailures = {
  forbidden: { code: "CONVERSATION_FORBIDDEN", status: 403 },
  limited: { code: "RECEIPTS_RATE_LIMITED", status: 429, retryAfter: "4" },
  malformed: { code: "RECEIPT_OUTCOME_UNKNOWN", status: 503 },
  empty: { code: "RECEIPT_OUTCOME_UNKNOWN", status: 503 },
  network: { code: "RECEIPT_OUTCOME_UNKNOWN", status: 503 },
};
for (const mode of [
  "success",
  "forbidden",
  "malformed",
  "empty",
  "network",
  "limited",
] as const) {
  const verify = async () => {
    const http = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (value: Parameters<typeof fetch>[0], init?: RequestInit) => {
          const request = new Request(value, init);
          expect(request.url).toBe(
            `http://local.test:3001/v1/conversations/${conversationId}/receipts`,
          );
          expect(request.method).toBe("POST");
          expect(request.headers.get("authorization")).toBe(
            "Bearer synthetic-token",
          );
          expect(request.headers.get(sourceHeaders.signature)).toMatch(
            /^[A-Za-z0-9_-]+$/,
          );
          expect(request.headers.get(sourceHeaders.digest)).toMatch(
            /^[a-f0-9]{64}$/,
          );
          expect(await request.json()).toEqual(input.payload);
          if (mode === "network") throw new Error("offline");
          if (mode === "forbidden")
            return Response.json(
              {
                ok: false,
                meta: { requestId: "11111111-1111-4111-8111-111111111111" },
                error: { code: "CONVERSATION_FORBIDDEN", message: "forbidden" },
              },
              { status: 403 },
            );
          if (mode === "limited")
            return Response.json(
              {
                ok: false,
                meta: { requestId: "11111111-1111-4111-8111-111111111111" },
                error: { code: "RECEIPTS_RATE_LIMITED", message: "limited" },
              },
              { status: 429, headers: { "Retry-After": "4" } },
            );
          if (mode === "malformed")
            return Response.json({ ok: true, data: { invalid: true } });
          return Response.json({
            ok: true,
            data: mode === "empty" ? { ...snapshot, receipts: [] } : snapshot,
            meta: { requestId: "11111111-1111-4111-8111-111111111111" },
          });
        },
        { preconnect: fetch.preconnect },
      ),
    );
    try {
      const result = await backend(input);
      if (mode === "success") {
        expect(result.isOk()).toBe(true);
        if (!result.isOk()) throw new Error("Expected success");
        expect(result.get()).toEqual(snapshot);
      } else {
        expect(result.isError()).toBe(true);
        if (!result.isError()) throw new Error("Expected failure");
        expect(result.getError()).toMatchObject(expectedFailures[mode]);
      }
    } finally {
      http.mockRestore();
    }
  };
  await verify();
}
