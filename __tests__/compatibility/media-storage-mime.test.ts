import { expect, spyOn, test } from "bun:test";
import { createStorageProfiles } from "../../apps/be-insta/src/domains/stories/adapters/s3/profiles";
import { put } from "../../apps/be-insta/src/domains/stories/adapters/s3/put";

test("S3 MIME follows buffered bytes while preserving conditional unique PUT", async () => {
  const seen: RequestInit[] = [];
  const fetch = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (
        _url: Parameters<typeof globalThis.fetch>[0],
        options?: RequestInit,
      ) => {
        if (options) seen.push(options);
        return new Response(null, { status: 200 });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  const resolve = createStorageProfiles([
    {
      id: "test",
      endpoint: "http://127.0.0.1:9000",
      playbackEndpoint: "http://127.0.0.1:9000",
      bucket: "test",
      region: "local",
      accessKeyId: "synthetic",
      secretAccessKey: "synthetic",
      prefix: "stories/",
    },
  ]);
  try {
    for (const [file, mime] of [
      ["webm/chrome-vp8.webm", "video/webm"],
      ["chrome-valid.mp4", "video/mp4"],
    ] as const) {
      const result = await put(resolve)({
        profile: "test",
        key: "stories/test.mp4",
        source: Bun.file(
          new URL(`../fixtures/media/${file}`, import.meta.url),
        ).stream(),
        maxBytes: 20971520,
        signal: new AbortController().signal,
      });
      expect(result.isOk()).toBe(true);
      expect(new Headers(seen.at(-1)?.headers).get("content-type")).toBe(mime);
      expect(new Headers(seen.at(-1)?.headers).get("if-none-match")).toBe("*");
    }
  } finally {
    fetch.mockRestore();
  }
});
