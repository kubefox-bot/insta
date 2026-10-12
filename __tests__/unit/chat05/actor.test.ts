import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { executeForActor } from "../../../apps/fe-insta/src/lib/session/server/authorized";
import { sessionFixture } from "../../fixtures/chat05/session";

test.each([
  { userId: "mallory", generation: "login1" },
  { userId: "alice", generation: "oldlogin" },
])(
  "authenticated current binding rejects foreign expected owner/generation $userId $generation",
  async (actor) => {
    const f = sessionFixture();
    const result = await executeForActor(
      {
        bindingId: "binding",
        actor,
        request: async () => {
          throw new Error("Must not cross protected boundary");
        },
      },
      f.dependencies,
    );
    expect(result.isError()).toBe(true);
    if (result.isError())
      expect(result.getError()).toEqual({ code: "ACTOR_CHANGED", status: 409 });
  },
);
test("caller snapshot cannot authorize invalid credentials; current authenticated actor can receive result", async () => {
  const f = sessionFixture();
  const actor = { userId: "alice", generation: "login1" };
  const current = await executeForActor(
    { bindingId: "binding", actor, request: async () => Result.Ok("private") },
    f.dependencies,
  );
  expect(current.isOk()).toBe(true);
  if (current.isOk()) expect(current.get()).toBe("private");
  f.state.authorized = false;
  const denied = await executeForActor(
    {
      bindingId: "binding",
      actor,
      request: async () => {
        throw new Error("No actor grant from caller snapshot");
      },
    },
    f.dependencies,
  );
  expect(denied.isError()).toBe(true);
});
