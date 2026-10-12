import { expect, test } from "bun:test";
import { sendRequest } from "../../apps/fe-insta/src/domains/conversations/server/send";
import type { SendDependencies } from "../../apps/fe-insta/src/domains/conversations/server/types";

test("send transport rejects foreign cookie origin before authentication or Nest", async () => {
  const dependencies: SendDependencies = {
    context: {},
    get sessions(): SendDependencies["sessions"] {
      throw new Error("Unexpected sessions");
    },
    get cookieKey(): Uint8Array {
      throw new Error("Unexpected cookie key");
    },
    get backend(): SendDependencies["backend"] {
      throw new Error("Unexpected Nest");
    },
  };
  const response = await sendRequest(
    {
      request: new Request("https://localhost/api/conversations/a/messages", {
        method: "POST",
        headers: { origin: "https://foreign.test" },
      }),
      origin: "https://localhost",
      cookies: {
        get: () => {
          throw new Error("must not read cookie");
        },
      },
      conversationId: "a".repeat(24),
    },
    dependencies,
  );
  expect(response.status).toBe(403);
});
