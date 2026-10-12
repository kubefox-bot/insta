import { z } from "zod";
import { webSessionHeaders } from "../../../../apps/fe-insta/src/lib/session/contracts/index";
import { expect } from "../../../fixtures/browser-egress/test";
import { publicationMedia, publicationVisibility } from "./conts";

const publicationSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    id: z.string(),
    author: z.object({ id: z.string(), username: z.string() }),
    expiresAt: z.number(),
    durationMs: z.number(),
  }),
});
export const publishFixtureStories = async ({
  page,
  account,
  count = 2,
  media = "mp4",
}: Readonly<{
  page: import("@playwright/test").Page;
  account: Readonly<{ email: string; password: string }>;
  count?: number;
  media?: keyof typeof publicationMedia;
}>) => {
  expect(
    (
      await page.request.post("https://localhost/api/auth/login", {
        headers: { origin: "https://localhost" },
        data: account,
      })
    ).status(),
  ).toBe(200);
  const session = await page.request.get("https://localhost/api/session");
  expect(session.status()).toBe(200);
  const actor = z
    .object({ data: z.object({ userId: z.string(), generation: z.string() }) })
    .parse(await session.json()).data;
  const selectedMedia = publicationMedia[media];
  const video = Buffer.from(
    await Bun.file(
      new URL(`../../../fixtures/media/${selectedMedia.file}`, import.meta.url),
    ).arrayBuffer(),
  );
  const stories: z.infer<typeof publicationSchema>["data"][] = [];
  for (let index = 0; index < count; index++) {
    const response = await page.request.post("https://localhost/api/stories", {
      headers: {
        origin: "https://localhost",
        [webSessionHeaders.ownerId]: actor.userId,
        [webSessionHeaders.generation]: actor.generation,
        "idempotency-key": `fixture-${crypto.randomUUID()}`,
      },
      multipart: {
        video: {
          name: selectedMedia.name,
          mimeType: selectedMedia.mimeType,
          buffer: video,
        },
      },
    });
    expect(response.status()).toBe(200);
    const publication = publicationSchema.parse(await response.json()).data;
    stories.push(publication);
    console.log(
      JSON.stringify({
        phase: "story-publication",
        status: response.status(),
        data: publication,
      }),
    );
  }
  const visibilityStarted = performance.now();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "https://localhost/api/stories",
        );
        if (!response.ok()) return false;
        const feed = z
          .object({
            data: z.object({
              authors: z.array(
                z.object({ stories: z.array(z.object({ id: z.string() })) }),
              ),
            }),
          })
          .parse(await response.json());
        return stories.every((story) =>
          feed.data.authors.some((group) =>
            group.stories.some((item) => item.id === story.id),
          ),
        );
      },
      {
        timeout: publicationVisibility.timeoutMs,
        intervals: [publicationVisibility.intervalMs],
      },
    )
    .toBe(true);
  console.log(
    JSON.stringify({
      phase: "story-feed-visible",
      ids: stories.map((story) => story.id),
      elapsedMs: Math.round(performance.now() - visibilityStarted),
    }),
  );
  await page.context().clearCookies();
  const author = stories[0]?.author;
  if (!author) throw new Error("No fixture publication");
  return { stories, author };
};
export const rejectAutoplay = async (page: import("@playwright/test").Page) =>
  page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.dataset.manualPlay) {
        this.dataset.manualPlay = "ready";
        return Promise.reject(
          new DOMException("Controlled autoplay rejection", "NotAllowedError"),
        );
      }
      return original.call(this);
    };
  });
