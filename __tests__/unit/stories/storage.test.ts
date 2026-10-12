import { expect, spyOn, test } from "bun:test";
import { createStoryStorage } from "../../../apps/be-insta/src/domains/stories/server/index";

const profile = {
  id: "local",
  endpoint: "http://127.0.0.1:1",
  playbackEndpoint: "https://localhost",
  bucket: "stories",
  region: "us-east-1",
  accessKeyId: "fixture",
  secretAccessKey: "fixture-secret",
  prefix: "stories/",
};
test("storage bounds the actual stream and cancels it before any provider effect", async () => {
  const storage = createStoryStorage({ profiles: [profile], clock: Date.now });
  let canceled = false;
  const result = await storage.putUnique({
    profile: "local",
    key: "stories/oversize.webm",
    maxBytes: 3,
    signal: new AbortController().signal,
    source: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(4));
      },
      cancel() {
        canceled = true;
      },
    }),
  });
  expect(result.toJSON()).toMatchObject({
    tag: "Error",
    error: "FILE_TOO_LARGE",
  });
  expect(canceled).toBe(true);
});
test("provider failure is not absence; profile and namespace validation precede I/O", async () => {
  const storage = createStoryStorage({ profiles: [profile], clock: Date.now });
  await expect(
    storage.read({
      profile: "local",
      key: "stories/missing.webm",
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("Stories storage");
  await expect(
    storage.read({
      profile: "unknown",
      key: "stories/missing.webm",
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("Unknown storage profile");
  await expect(
    storage.delete({ profile: "local", key: "../foreign" }),
  ).rejects.toThrow("Invalid storage key");
  expect(() =>
    storage.signPlayback({
      profile: "local",
      key: "stories/a.webm",
      expiresAt: Date.now() + 302000,
    }),
  ).toThrow("Invalid playback expiry");
});

for (const remainingMs of [0, 500, 999]) {
  test(`storage returns expiry rather than provider failure with ${remainingMs}ms left`, () => {
    const storage = createStoryStorage({
      profiles: [profile],
      clock: () => 1767225600000,
    });
    expect(
      storage.signPlayback({
        profile: "local",
        key: "stories/a.webm",
        expiresAt: 1767225600000 + remainingMs,
      }),
    ).toEqual({ kind: "expired" });
  });
}

for (const [remainingMs, seconds, deadline] of [
  [1000, "1", 1767225601000],
  [1500, "1", 1767225601000],
  [300000, "300", 1767225900000],
] as const) {
  test(`storage returns the actual signed deadline for a ${remainingMs}ms window`, () => {
    const url = `https://localhost/stories/a.webm?X-Amz-Date=20260101T000000Z&X-Amz-Expires=${seconds}`;
    const provider = spyOn(Bun.S3Client.prototype, "presign").mockReturnValue(
      url,
    );
    try {
      const storage = createStoryStorage({
        profiles: [profile],
        clock: () => 1767225600000,
      });
      expect(
        storage.signPlayback({
          profile: "local",
          key: "stories/a.webm",
          expiresAt: 1767225600000 + remainingMs,
        }),
      ).toEqual({ kind: "signed", url, expiresAt: deadline });
      expect(provider).toHaveBeenCalledWith("stories/a.webm", {
        method: "GET",
        expiresIn: Number(seconds),
      });
    } finally {
      provider.mockRestore();
    }
  });
}

test("storage does not expose a signature that crosses the story deadline after the signer advances a second", () => {
  const provider = spyOn(Bun.S3Client.prototype, "presign").mockReturnValue(
    "https://localhost/stories/a.webm?X-Amz-Date=20260101T000001Z&X-Amz-Expires=1",
  );
  try {
    const storage = createStoryStorage({
      profiles: [profile],
      clock: () => 1767225600900,
    });
    expect(
      storage.signPlayback({
        profile: "local",
        key: "stories/a.webm",
        expiresAt: 1767225601900,
      }),
    ).toEqual({ kind: "expired" });
  } finally {
    provider.mockRestore();
  }
});

test("storage rechecks time after signing and does not expose an already elapsed URL", () => {
  const times = [1767225600000, 1767225601000];
  const provider = spyOn(Bun.S3Client.prototype, "presign").mockReturnValue(
    "https://localhost/stories/a.webm?X-Amz-Date=20260101T000000Z&X-Amz-Expires=1",
  );
  try {
    const storage = createStoryStorage({
      profiles: [profile],
      clock: () => times.shift() ?? 1767225601000,
    });
    expect(
      storage.signPlayback({
        profile: "local",
        key: "stories/a.webm",
        expiresAt: 1767225601500,
      }),
    ).toEqual({ kind: "expired" });
  } finally {
    provider.mockRestore();
  }
});

for (const query of [
  "",
  "X-Amz-Date=bad&X-Amz-Expires=1",
  "X-Amz-Date=20260230T000000Z&X-Amz-Expires=1",
  "X-Amz-Date=20260101T000000Z&X-Amz-Expires=0",
  "X-Amz-Date=20260101T000000Z&X-Amz-Expires=1.5",
  "X-Amz-Date=20260101T000000Z&X-Amz-Expires=301",
  "X-Amz-Date=20260101T000000Z&X-Amz-Expires=1&X-Amz-Expires=2",
  "X-Amz-Date=20260101T000000Z&X-Amz-Date=20260101T000001Z&X-Amz-Expires=1",
]) {
  test(`storage rejects malformed provider signature parameters: ${query}`, () => {
    const provider = spyOn(Bun.S3Client.prototype, "presign").mockReturnValue(
      `https://localhost/stories/a.webm?${query}`,
    );
    try {
      const storage = createStoryStorage({
        profiles: [profile],
        clock: () => 1767225600000,
      });
      expect(() =>
        storage.signPlayback({
          profile: "local",
          key: "stories/a.webm",
          expiresAt: 1767225601500,
        }),
      ).toThrow("Invalid playback signature");
    } finally {
      provider.mockRestore();
    }
  });
}

test("native Bun presign returns the exact bounded deadline reported by storage", () => {
  const requestedExpiresAt = Date.now() + 60000;
  const storage = createStoryStorage({ profiles: [profile], clock: Date.now });
  const signed = storage.signPlayback({
    profile: "local",
    key: "stories/a.webm",
    expiresAt: requestedExpiresAt,
  });
  expect(signed.kind).toBe("signed");
  if (signed.kind !== "signed") throw Error("Unexpected expired window");
  const parameters = new URL(signed.url).searchParams;
  const date = parameters.get("X-Amz-Date");
  const duration = parameters.get("X-Amz-Expires");
  expect(date).toMatch(/^\d{8}T\d{6}Z$/);
  if (!date || !duration) throw Error("Signature parameters missing");
  const signedAt = Date.parse(
    date.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z",
    ),
  );
  expect(signed.expiresAt).toBe(signedAt + Number(duration) * 1000);
  expect(signed.expiresAt).toBeLessThanOrEqual(requestedExpiresAt);
  expect(signed.expiresAt).toBeGreaterThan(Date.now());
});
