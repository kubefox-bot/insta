import { expect, test } from "bun:test";
import { authorizeContinuationRequest } from "../../../apps/fe-insta/src/domains/auth-continuation/server/authorize-request";

test("failed actor lookup cannot be downgraded to a guest continuation or persist metadata", async () => {
  let records = 0;
  const cookies = {
    parse: () => {
      throw new Error("Unexpected cookie parse");
    },
    get: () => undefined,
    getAll: () => [],
    set: () => {},
    delete: () => {},
    serialize: () => "",
  };
  const response = await authorizeContinuationRequest(
    {
      operation: "create",
      origin: "https://localhost",
      request: new Request("https://localhost/api/auth/continuation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://localhost",
        },
        body: JSON.stringify({
          type: "compose_message",
          recipientId: "recipient",
          operationId: crypto.randomUUID(),
        }),
      }),
      cookies,
    },
    {
      key: new Uint8Array(32).fill(1),
      intents: {
        create: async () => {
          records += 1;
          return true;
        },
        find: async () => undefined,
        compare: async () => false,
      },
      targets: { resolve: async () => undefined },
      identity: {
        read: async () => ({ status: "unavailable", actor: null }),
        registrationDeadline: async () => undefined,
      },
    },
  );
  expect(response.status).toBe(409);
  expect(records).toBe(0);
});
