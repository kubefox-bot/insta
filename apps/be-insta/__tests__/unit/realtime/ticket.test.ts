import { expect, test } from "bun:test";

test("WS ticket public operation issues an expiring actor-bound opaque ticket", async () => {
  const path = "../../../src/domains/users/auth/use-cases/issue-ws-ticket.ts";
  expect(await Bun.file(new URL(path, import.meta.url)).exists()).toBe(true);
  const { issueWsTicket } = await import(path);
  const saved: unknown[] = [];
  const actor = {
    userId: "actor",
    backendSessionId: "session",
    username: "Alice",
    accessExpiresAt: 100000,
  };
  const result = await issueWsTicket(
    { actor },
    {
      clock: () => 1000,
      random: () => "opaque-ticket",
      tickets: {
        issue: async (input: unknown) => {
          saved.push(input);
        },
      },
    },
  );
  expect(result).toEqual({ ticket: "opaque-ticket", expiresAt: 31000 });
  expect(saved).toEqual([{ ticket: "opaque-ticket", actor, expiresAt: 31000 }]);
});
