import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createDirectoryNames } from "../../../apps/fe-insta/src/domains/conversations/browser/directory-names/create";

const alice = { userId: "alice", username: "Alice", generation: "g1" };
const bob = { userId: "bob", username: "Bob", generation: "g2" };

test("authorized loaded names are copied into an owned readonly presentation snapshot", () => {
  const names = createDirectoryNames();
  names.reconcile({ actor: alice, status: "authenticated" });
  const input = [{ id: "bob", username: "Loaded Bob" }];
  names.capture(alice)(input);
  input[0].username = "Caller changed";
  expect(get(names.view).get("bob")).toBe("Loaded Bob");
  const previous = get(names.view);
  names.capture(alice)([{ id: "carol", username: "Loaded Carol" }]);
  expect(previous.has("carol")).toBe(false);
  expect(get(names.view).get("carol")).toBe("Loaded Carol");
});

test("owner and generation changes fence delayed directory responses and clear private names", () => {
  const names = createDirectoryNames();
  names.reconcile({ actor: alice, status: "authenticated" });
  const delayed = names.capture(alice);
  delayed([{ id: "bob", username: "Private name" }]);
  names.reconcile({ actor: bob, status: "authenticated" });
  delayed([{ id: "bob", username: "Late private name" }]);
  expect(get(names.view).size).toBe(0);
  const receiveBob = names.capture(bob);
  receiveBob([{ id: "alice", username: "Loaded Alice" }]);
  names.reconcile({
    actor: { ...bob, generation: "g3" },
    status: "authenticated",
  });
  receiveBob([{ id: "alice", username: "Old generation" }]);
  expect(get(names.view).size).toBe(0);
});

test("unknown session, logout cleanup and disposal prevent delayed private-name resurrection", () => {
  const names = createDirectoryNames();
  names.reconcile({ actor: alice, status: "authenticated" });
  const receive = names.capture(alice);
  receive([{ id: "bob", username: "Private Bob" }]);
  names.reconcile({ actor: null, status: "unavailable" });
  receive([{ id: "bob", username: "Late Bob" }]);
  expect(get(names.view).size).toBe(0);
  names.reconcile({ actor: alice, status: "authenticated" });
  receive([{ id: "bob", username: "Reloaded Bob" }]);
  names.clear();
  receive([{ id: "bob", username: "Post-logout Bob" }]);
  expect(get(names.view).size).toBe(0);
  names.dispose();
  names.reconcile({ actor: alice, status: "authenticated" });
  receive([{ id: "bob", username: "Post-disposal Bob" }]);
  expect(get(names.view).size).toBe(0);
});
