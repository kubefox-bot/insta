import { expect, test } from "bun:test";
import { authFormAction } from "../../../apps/fe-insta/src/domains/users/server/forms";

test("auth form executes with explicit narrow handlers and no host locals", async () => {
  const body = new FormData();
  body.set("step", "start");
  body.set("email", "synthetic@example.test");
  const requests: unknown[] = [];
  const result = await authFormAction(
    {
      request: new Request("https://localhost/", {
        method: "POST",
        body,
        headers: { "x-sveltekit-action": "true" },
      }),
      url: new URL("https://localhost/"),
      cookies: {
        get: () => undefined,
        getAll: () => [],
        set: () => {},
        delete: () => {},
        parse: () => {
          throw new Error("Unexpected cookie parse");
        },
        serialize: () => "",
      },
    },
    {
      login: async () => {
        throw new Error("Wrong auth handler");
      },
      registration: async ({ request }) => {
        requests.push(await request.json());
        return Response.json({ ok: true, data: { stage: "code" } });
      },
      session: async () => {
        throw new Error("Wrong auth handler");
      },
    },
  );
  expect(result).toEqual({
    success: true,
    stage: "code",
    revocation: undefined,
  });
  expect(requests).toEqual([
    { step: "start", email: "synthetic@example.test" },
  ]);
});
