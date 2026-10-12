import { expect, test } from "bun:test";
import { createCreationNavigation } from "../create";

test.each([
  "https://evil.test",
  "//evil.test",
  "/\\evil.test",
  "/stories/new",
  "/conversations/../logout",
])("unsafe return %s falls back to member chats", async (returnTarget) => {
  const visited: string[] = [];
  await createCreationNavigation({
    returnTarget,
    authenticated: true,
    navigate: async (target) => {
      visited.push(target);
    },
  }).finish();
  expect(visited).toEqual(["/conversations"]);
});
test("local chat destination is passed to the owning adapter", async () => {
  const visited: string[] = [];
  const navigation = createCreationNavigation({
    returnTarget: "/conversations/chat-1",
    authenticated: true,
    navigate: async (target) => {
      visited.push(target);
    },
  });
  await navigation.finish();
  expect(visited).toEqual(["/conversations/chat-1"]);
});
test("direct guest exit goes home", async () => {
  const visited: string[] = [];
  await createCreationNavigation({
    authenticated: false,
    navigate: async (target) => {
      visited.push(target);
    },
  }).finish();
  expect(visited).toEqual(["/"]);
});
