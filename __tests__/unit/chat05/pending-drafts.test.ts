import { expect, test } from "bun:test";

import { createPendingDrafts } from "../../../apps/fe-insta/src/domains/conversations/browser/drafts/pending";

test("pending_draft_is_owner_bound_and_one_use", () => {
  const drafts = createPendingDrafts();
  drafts.remember({
    intentId: "owned",
    text: "draft",
    expectedUserId: "alice",
  });
  expect(drafts.take({ intentId: "owned", actorId: "bob" })).toBeUndefined();
  expect(drafts.take({ intentId: "owned", actorId: "alice" })).toBeUndefined();
  drafts.remember({ intentId: "same", text: "mine", expectedUserId: "alice" });
  expect(drafts.take({ intentId: "same", actorId: "alice" })).toBe("mine");
  expect(drafts.take({ intentId: "same", actorId: "alice" })).toBeUndefined();
  drafts.remember({ intentId: "guest", text: "guest text" });
  expect(drafts.take({ intentId: "guest", actorId: "alice" })).toBe(
    "guest text",
  );
  drafts.remember({ intentId: "cancelled", text: "cancel" });
  drafts.remember({ intentId: "survivor", text: "keep" });
  drafts.cancel("cancelled");
  expect(
    drafts.take({ intentId: "cancelled", actorId: "alice" }),
  ).toBeUndefined();
  expect(drafts.take({ intentId: "survivor", actorId: "alice" })).toBe("keep");
  drafts.remember({ intentId: "disposed", text: "private" });
  drafts.dispose();
  expect(
    drafts.take({ intentId: "disposed", actorId: "alice" }),
  ).toBeUndefined();
});
