import { expect, test } from "bun:test";
import { logoutFormRequest } from "../../../apps/fe-insta/src/domains/users/server/transport/logout-form";

test("queued old-S1 logout form cannot revoke newly current S2 cookie identity", async () => {
  let revoked = false;
  const auth = {
    session: async ({ request }: Parameters<typeof logoutFormRequest>[0]) => {
      if (request.method === "GET")
        return Response.json({
          ok: true,
          data: { userId: "user2", username: "User2", generation: "S2" },
        });
      revoked = true;
      return Response.json({ ok: true, data: { revocation: "confirmed" } });
    },
  };
  const cookies = {
    parse: () => {
      throw new Error("Unexpected cookie parse");
    },
    get: () => undefined,
    getAll: () => [],
    set: () => {
      throw new Error("Unexpected cookie write");
    },
    delete: () => {
      throw new Error("Unexpected cookie delete");
    },
    serialize: () => {
      throw new Error("Unexpected serialization");
    },
  };
  const response = await logoutFormRequest(
    {
      request: new Request("https://localhost/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "https://localhost",
        },
        body: JSON.stringify({ generation: "S1" }),
      }),
      origin: "https://localhost",
      cookies,
    },
    { auth },
  );
  expect(response.status).toBe(409);
  expect(revoked).toBe(false);
});
