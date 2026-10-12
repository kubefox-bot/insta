import { expect, test } from "bun:test";
import { inspectRequestForRoute } from "../../apps/fe-insta/src/app/http/server/limits/index";
import { publishRequest } from "../../apps/fe-insta/src/domains/stories/server/publish";
import type { StoryRequestDependencies } from "../../apps/fe-insta/src/domains/stories/server/types";

const dependencies: StoryRequestDependencies = {
  context: {},
  get session(): StoryRequestDependencies["session"] {
    throw new Error("Unexpected session");
  },
  get cookieKey(): Uint8Array {
    throw new Error("Unexpected key");
  },
  get backend(): StoryRequestDependencies["backend"] {
    throw new Error("Unexpected transport");
  },
};
test("Stories foreign Origin and missing actor deny without consuming file", async () => {
  for (const origin of ["https://foreign.test", "https://localhost"]) {
    let reads = 0;
    const request = new Request("https://localhost/api/stories", {
      method: "POST",
      headers: { origin, "content-type": "multipart/form-data; boundary=test" },
      body: new ReadableStream(
        {
          pull() {
            reads++;
          },
        },
        { highWaterMark: 0 },
      ),
    });
    const response = await publishRequest(
      {
        request,
        origin: "https://localhost",
        cookies: {
          get: () => {
            throw new Error("Cookie read before admission");
          },
        },
      },
      dependencies,
    );
    expect(response.status).toBe(origin === "https://localhost" ? 401 : 403);
    expect(reads).toBe(0);
  }
});
test("only exact Stories POST owns body admission", async () => {
  for (const [method, routeId, want] of [
    ["POST", "/api/stories", null],
    ["PUT", "/api/stories", "json"],
    ["POST", "/api/stories-extra", "json"],
    ["POST", "/api/stories/[id]", "json"],
  ] as const) {
    expect(
      await inspectRequestForRoute({
        request: new Request("https://localhost/test", {
          method,
          headers: { "content-type": "application/json" },
          body: " ".repeat(65537),
        }),
        route: { id: routeId },
      }),
    ).toBe(want);
  }
});
