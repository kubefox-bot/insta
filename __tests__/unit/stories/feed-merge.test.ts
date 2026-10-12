import { expect, test } from "bun:test";
import { mergeFeedPages } from "../../../apps/fe-insta/src/domains/stories/browser/index";

const story = (id: string, authorId: string, publishedAt: number) => ({
  id,
  author: { id: authorId, username: authorId },
  publishedAt,
  expiresAt: 100,
  durationMs: 10,
});
const group = (id: string, stories: ReturnType<typeof story>[]) => ({
  author: { id, username: id },
  latestPublishedAt: Math.max(...stories.map((value) => value.publishedAt)),
  stories,
});
test("refresh with concurrently published author merges pages by author and story identity in chronological order", () => {
  const old = {
    authors: [
      group("b", [story("b1", "b", 20)]),
      group("a", [story("a1", "a", 10)]),
    ],
    cursor: "older",
  };
  const newest = {
    authors: [group("a", [story("a1", "a", 10), story("a2", "a", 30)])],
    cursor: "new",
  };
  const merged = mergeFeedPages({ pages: [newest, old], now: 50 });
  expect(merged.map((value) => value.author.id)).toEqual(["a", "b"]);
  expect(merged[0]?.stories.map((value) => value.id)).toEqual(["a1", "a2"]);
  expect(mergeFeedPages({ pages: [newest, old], now: 100 })).toEqual([]);
  expect(old.authors[1]?.stories).toHaveLength(1);
});
