import { expect, mock, spyOn, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { executeForActor } from "../../../apps/fe-insta/src/lib/session/server/authorized";
import { sessionFixture } from "../../fixtures/chat05/session";

mock.module("$app/server", () => ({}));
const { createStoryBackend } = await import(
  "../../../apps/fe-insta/src/domains/stories/server/adapters/backend"
);

import { storyReply } from "../../../apps/fe-insta/src/domains/stories/server/lib/reply";
import { readServerConfig } from "../../../apps/fe-insta/src/lib/config/server/index";

const context = {
  requestId: "public-request",
  consentProof: "PRIVATE_CONSENT_SENTINEL",
};
const backend = createStoryBackend({
  config: readServerConfig({
    raw: Object.fromEntries([
      ["API_BASE_URL", "http://localhost:3001"],
      [
        "WEB_MONGO_URL",
        "mongodb://synthetic:synthetic@localhost/insta_web?authSource=insta_web&replicaSet=rs0",
      ],
      ["SESSION_ENCRYPTION_KEY", "a".repeat(64)],
      ["BFF_SOURCE_SIGNING_KEY", "b".repeat(64)],
    ]),
  }),
  context,
  source: async () => "127.0.0.1",
});

const replaceFetch = (
  implementation: (...args: Parameters<typeof fetch>) => Promise<Response>,
) =>
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(implementation, { preconnect: fetch.preconnect }),
  );

test("Stories error metadata allowlists public correlation and never returns consent proof", async () => {
  const response = storyReply(
    Result.Error({ code: "FORBIDDEN", status: 403 }),
    context,
  );
  expect((await response.json()).meta).toEqual({ requestId: "public-request" });
});

test("backend assigned operation survives pending response without incoming key and drives status recovery", async () => {
  const operationId = "assigned-operation";
  const requests: string[] = [];
  const mocked = replaceFetch(async (url) => {
    requests.push(String(url));
    if (requests.length === 1)
      return Response.json(
        {
          ok: false,
          error: { code: "OPERATION_OUTCOME_UNKNOWN", message: "pending" },
          meta: { requestId: "backend-request", operationId },
        },
        { status: 503 },
      );
    return Response.json({
      ok: true,
      data: { state: "pending", operationId },
      meta: { requestId: "status-request", operationId },
    });
  });
  try {
    const response = storyReply(
      await executeForActor(
        {
          bindingId: "binding",
          actor: { userId: "alice", generation: "login1" },
          replay: "never",
          request: () =>
            backend({
              operation: "publish",
              request: new Request("https://localhost/api/stories", {
                method: "POST",
                headers: {
                  "content-type": "multipart/form-data; boundary=test",
                },
                body: "--test--",
              }),
            }),
        },
        sessionFixture().dependencies,
      ),
      context,
    );
    const reply = await response.json();
    expect(response.status).toBe(503);
    expect(reply.meta).toEqual({ requestId: "backend-request", operationId });
    const recovered = storyReply(
      await backend({
        operation: "publication",
        id: reply.meta.operationId,
        request: new Request(
          "https://localhost/api/stories/publications/status",
        ),
      }),
      context,
    );
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).data.state).toBe("pending");
    expect(requests).toEqual([
      "http://localhost:3001/v1/stories",
      `http://localhost:3001/v1/stories/publications/${operationId}`,
    ]);
  } finally {
    mocked.mockRestore();
  }
});

test("known predispatch upload admission preserves 400/413 with zero fetches and zero body reads", async () => {
  const mocked = replaceFetch(async () => {
    throw new Error("Unexpected dispatch");
  });
  try {
    for (const [headers, status, code] of [
      [{ "content-type": "application/json" }, 400, "INVALID_UPLOAD"],
      [
        {
          "content-type": "multipart/form-data; boundary=test",
          "content-length": "22020097",
        },
        413,
        "FILE_TOO_LARGE",
      ],
      [
        {
          "content-type": "multipart/form-data; boundary=test",
          "content-length": "invalid",
        },
        400,
        "INVALID_UPLOAD",
      ],
    ] as const) {
      let reads = 0;
      const request = new Request("https://localhost/api/stories", {
        method: "POST",
        headers,
        body: new ReadableStream(
          {
            pull() {
              reads++;
            },
          },
          { highWaterMark: 0 },
        ),
      });
      const response = storyReply(
        await backend({ operation: "publish", request }),
        context,
      );
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
      expect(reads).toBe(0);
    }
    expect(mocked).toHaveBeenCalledTimes(0);
  } finally {
    mocked.mockRestore();
  }
});

test("streamed overflow after dispatch stays recoverable unknown and never replays", async () => {
  const mocked = replaceFetch(async (_url, init) => {
    await new Response(init?.body).arrayBuffer();
    throw new Error("Stream must reject first");
  });
  try {
    const request = new Request("https://localhost/api/stories", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=test" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(22020097));
          controller.close();
        },
      }),
    });
    const response = storyReply(
      await backend({ operation: "publish", request }),
      { ...context, operationId: "known-operation" },
    );
    expect(response.status).toBe(503);
    const reply = await response.json();
    expect(reply.error.code).toBe("OPERATION_OUTCOME_UNKNOWN");
    expect(reply.meta.operationId).toBe("known-operation");
    expect(mocked).toHaveBeenCalledTimes(1);
  } finally {
    mocked.mockRestore();
  }
});

test("feed forwards cursor and limit while preserving backend Retry-After", async () => {
  const requests: string[] = [];
  const mocked = replaceFetch(async (url) => {
    requests.push(String(url));
    return Response.json(
      {
        ok: false,
        error: { code: "BUSY", message: "BUSY" },
        meta: { requestId: "backend-request" },
      },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  });
  try {
    const result = await backend({
      operation: "feed",
      request: new Request(
        "https://app.invalid/api/stories?limit=7&cursor=abc",
      ),
    });
    expect(requests).toEqual([
      "http://localhost:3001/v1/stories?limit=7&cursor=abc",
    ]);
    const response = storyReply(result, context);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  } finally {
    mocked.mockRestore();
  }
});
