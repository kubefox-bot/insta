import { expect, test } from "bun:test";
import { loadSession } from "../../../apps/fe-insta/src/domains/users/server/load-session";

for (const cookie of [undefined, "existing-binding"]) {
  test(`SSR ${cookie ? "existing binding preserves unavailable" : "guest avoids persistence acquisition"}`, async () => {
    let acquisitions = 0;
    const result = await loadSession({
      request: new Request("https://localhost/"),
      origin: "https://localhost",
      cookies: {
        get: (name) => (name === "insta_session" ? cookie : undefined),
        getAll: () => [],
        set: () => {},
        delete: () => {},
        parse: () => {
          throw new Error("Unexpected cookie parse");
        },
        serialize: () => "",
      },
      auth: {
        session: async () => {
          acquisitions += 1;
          throw new Error("Persistence unavailable");
        },
      },
    });
    expect(result).toEqual({
      actor: null,
      status: cookie ? "unavailable" : "guest",
    });
    expect(acquisitions).toBe(cookie ? 1 : 0);
  });
}
