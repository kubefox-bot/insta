import { expect, test } from "bun:test";
import { get, writable } from "svelte/store";
import type {
  FeedGroup,
  PlayerView,
} from "../../../apps/fe-insta/src/domains/stories/browser/index";
import { createContactOperation } from "../../../apps/fe-insta/src/domains/stories/components/StoryPlayer/contact/create";

const group = (id: string): FeedGroup => ({
  author: { id, username: id },
  latestPublishedAt: 1000,
  stories: [
    {
      id: `story-${id}`,
      author: { id, username: id },
      publishedAt: 1000,
      expiresAt: 10000,
      durationMs: 1000,
    },
  ],
});
const a = group("a");
const b = group("b");
const ready = (group: FeedGroup): PlayerView => {
  const story = group.stories[0];
  if (!story) throw new Error("Fixture story absent");
  return {
    kind: "ready",
    group,
    index: 0,
    story,
    playback: { url: "https://localhost/test.mp4", expiresAt: 9000 },
  };
};
for (const outcome of ["resolve", "reject"] as const) {
  test(`stale contact ${outcome}/finally leaves newer selection pending; only current rejection sets error`, async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const requests = [first.promise, second.promise];
    const calls: string[] = [];
    const selection = writable(ready(a));
    const contact = createContactOperation({
      selection,
      close: () => selection.set({ kind: "closed" }),
      requestConversation: ({ authorId: id }) => {
        calls.push(id);
        const request = requests.shift();
        if (!request) throw new Error("Unexpected request");
        return request;
      },
    });
    const older = contact.run();
    selection.set({ kind: "closed" });
    selection.set(ready(b));
    expect(get(contact.view)).toEqual({ pending: false, failed: false });
    const newer = contact.run();
    first[outcome]();
    await older;
    expect(get(selection).kind).toBe("ready");
    expect(get(contact.view)).toEqual({ pending: true, failed: false });
    second.reject(new Error("Current rejection"));
    await newer;
    expect(get(contact.view)).toEqual({ pending: false, failed: true });
    expect(calls).toEqual(["a", "b"]);
    contact.dispose();
  });
}
test("same exact author/story object reopened after close gets a new lifetime; stale success cannot close it", async () => {
  const result = Promise.withResolvers<void>();
  const current = ready(a);
  const selection = writable(current);
  const contact = createContactOperation({
    selection,
    close: () => selection.set({ kind: "closed" }),
    requestConversation: () => result.promise,
  });
  const request = contact.run();
  selection.set({ kind: "closed" });
  selection.set(current);
  result.resolve();
  await request;
  expect(get(selection)).toBe(current);
  expect(get(contact.view)).toEqual({ pending: false, failed: false });
  contact.dispose();
});
test("current success closes once and duplicate pending clicks do not create another request", async () => {
  const result = Promise.withResolvers<void>();
  const selection = writable(ready(a));
  const calls: string[] = [];
  const contact = createContactOperation({
    selection,
    close: () => selection.set({ kind: "closed" }),
    requestConversation: ({ authorId: id }) => {
      calls.push(id);
      return result.promise;
    },
  });
  const request = contact.run();
  await contact.run();
  expect(calls).toEqual(["a"]);
  result.resolve();
  await request;
  expect(get(selection)).toEqual({ kind: "closed" });
  expect(get(contact.view)).toEqual({ pending: false, failed: false });
  contact.dispose();
});
test("dispose unsubscribes selection and late failure cannot update UI state", async () => {
  const result = Promise.withResolvers<void>();
  const state = writable(ready(a));
  const subscriptions = { active: 0 };
  const contact = createContactOperation({
    selection: {
      subscribe: (run) => {
        subscriptions.active++;
        const release = state.subscribe(run);
        return () => {
          subscriptions.active--;
          release();
        };
      },
    },
    close: () => state.set({ kind: "closed" }),
    requestConversation: () => result.promise,
  });
  const request = contact.run();
  contact.dispose();
  expect(subscriptions.active).toBe(0);
  result.reject(new Error("Late failure"));
  await request;
  expect(get(contact.view)).toEqual({ pending: false, failed: false });
  expect(get(state).kind).toBe("ready");
});

test("contact supplies a captured selection guard that rejects close/reopen ABA", async () => {
  const result = Promise.withResolvers<void>();
  const selection = writable(ready(a));
  let selected: (() => boolean) | undefined;
  let author: string | undefined;
  const contact = createContactOperation({
    selection,
    close: () => selection.set({ kind: "closed" }),
    requestConversation: (input) => {
      author = typeof input === "string" ? input : input.authorId;
      selected = typeof input === "string" ? undefined : input.isSelected;
      return result.promise;
    },
  });
  const request = contact.run();
  expect(author).toBe("a");
  expect(selected?.()).toBe(true);
  selection.set({ kind: "closed" });
  selection.set(ready(a));
  expect(selected?.()).toBe(false);
  result.resolve();
  await request;
  contact.dispose();
});
