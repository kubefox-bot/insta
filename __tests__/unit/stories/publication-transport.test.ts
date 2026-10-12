import { expect, test } from "bun:test";
import { createPublicationTransport } from "../../../apps/fe-insta/src/domains/stories/browser/adapters/http/publication";

const create = (response: () => Response) =>
  createPublicationTransport({
    request: async () => response(),
    publishPath: "/api/stories",
    publicationPath: (id) => `/api/stories/publications/${id}`,
    actor: () => ({ userId: "one", generation: "S1" }),
  });
const input = () => ({
  blob: new Blob(["private"]),
  operationId: "operation",
  generation: "S1",
  signal: new AbortController().signal,
});
test("BFF stale generation409 requests identity reconciliation instead of permanent unknown", async () => {
  const transport = create(() =>
    Response.json(
      {
        ok: false,
        error: { code: "ACTOR_CHANGED" },
        meta: { requestId: "request" },
      },
      { status: 409 },
    ),
  );
  expect(await transport.publish(input())).toEqual({ kind: "authentication" });
  expect(await transport.readPublication(input())).toEqual({
    kind: "authentication",
  });
});
test("lookup outage and malformed not_found never become authoritative absence", async () => {
  for (const response of [
    Response.json({ ok: false }, { status: 503 }),
    Response.json({
      ok: true,
      data: { state: "not_found", operationId: "operation" },
    }),
  ] as const) {
    const transport = create(() => response);
    expect(await transport.readPublication(input())).toEqual({
      kind: "unknown",
    });
  }
});
test("strict inspector rejection retains known failure while arbitrary server codes remain unknown", async () => {
  for (const [code, kind] of [
    ["TOO_LONG", "rejected"],
    ["MALFORMED_MEDIA", "rejected"],
    ["ACTIVE_LIMIT", "rejected"],
    ["STORY_LIMIT_REACHED", "unknown"],
    ["STORIES_DISABLED", "unknown"],
    ["OPERATION_OUTCOME_UNKNOWN", "unknown"],
    ["DEPENDENCY_UNAVAILABLE", "unknown"],
  ] as const) {
    const transport = create(() =>
      Response.json(
        {
          ok: false,
          error: { code },
          meta: { requestId: "request", operationId: "operation" },
        },
        { status: 400 },
      ),
    );
    expect((await transport.publish(input())).kind).toBe(kind);
  }
});

test.each([
  ["video/webm;codecs=vp8,opus", "story.webm"],
  ["video/webm;codecs=vp9,opus", "story.webm"],
  ["video/mp4", "story.mp4"],
])(
  "publication filename follows%s while preserving exact uploaded bytes",
  async (mime, name) => {
    const blob = new Blob(["final recording"], { type: mime });
    const captured: File[] = [];
    const transport = createPublicationTransport({
      request: async (_path, init) => {
        const body = init?.body;
        if (!(body instanceof FormData)) throw new Error("Missing multipart");
        const video = body.get("video");
        if (!(video instanceof File)) throw new Error("Missing video");
        captured.push(video);
        return new Response(null, { status: 401 });
      },
      publishPath: "/api/stories",
      publicationPath: (id) => id,
      actor: () => ({ userId: "one", generation: "S1" }),
    });
    expect(await transport.publish({ ...input(), blob })).toEqual({
      kind: "authentication",
    });
    expect(captured[0]?.name).toBe(name);
    expect(captured[0]?.type).toBe(mime);
    expect(await captured[0]?.text()).toBe(await blob.text());
  },
);
