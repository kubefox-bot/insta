import { expect, test } from "bun:test";
import { storyCollections } from "../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import type { UploadDocument } from "../../../apps/be-insta/src/domains/stories/adapters/mongo/types";
import { createStoryStorage } from "../../../apps/be-insta/src/domains/stories/server/index";
import { readStoriesConfig } from "../../../apps/be-insta/src/lib/config/stories/read";
import { startEgressServer } from "../../fixtures/browser-egress/server";
import {
  readStoriesTestCertificate,
  readStoriesTestConfig,
} from "../../fixtures/media/config";

/** Вычисляет ожидаемый deadline непосредственно из провайдерской подписи, независимо от адаптера. */
const signatureDeadline = (url: string) => {
  const parameters = new URL(url).searchParams;
  const date = parameters.get("X-Amz-Date");
  const seconds = parameters.get("X-Amz-Expires");
  if (!date || !seconds) throw new Error("Signed expiry parameters missing");
  return (
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(4, 6)) - 1,
      Number(date.slice(6, 8)),
      Number(date.slice(9, 11)),
      Number(date.slice(11, 13)),
      Number(date.slice(13, 15)),
    ) +
    Number(seconds) * 1000
  );
};

test("private storage conditional PUT preserves winner; read absence, pagination, signed host and Range survive actual provider", async () => {
  const config = readStoriesConfig(readStoriesTestConfig());
  if (config.mode !== "enabled")
    throw new Error("Enabled Stories profile required");
  const storage = createStoryStorage({
    profiles: config.profiles,
    clock: Date.now,
  });
  const egress = await startEgressServer({ port: 0 });
  const playbackOptions = {
    proxy: `http://127.0.0.1:${egress.port}`,
    tls: { ca: readStoriesTestCertificate() },
  };
  const profile = config.activeProfile;
  const selected = config.profiles.find((item) => item.id === profile);
  if (!selected) throw new Error("Missing selected profile");
  const prefix = `${selected.prefix}${crypto.randomUUID()}/`;
  const keys = [`${prefix}a.webm`, `${prefix}b.webm`, `${prefix}c.webm`];
  const first = keys[0];
  if (!first) throw new Error("Missing test key");
  const signal = new AbortController().signal;
  const put = (key: string, value: string) =>
    storage.putUnique({
      profile,
      key,
      source: new Blob([value]).stream(),
      maxBytes: 20971520,
      signal,
    });
  try {
    expect(await storage.read({ profile, key: first, signal })).toEqual({
      kind: "missing",
    });
    const competing = await Promise.all([
      put(first, "first"),
      put(first, "other"),
    ]);
    expect(competing.filter((value) => value.isOk())).toHaveLength(1);
    expect(
      competing
        .filter((value) => value.isError())
        .map((value) => value.toJSON()),
    ).toMatchObject([{ tag: "Error", error: "OBJECT_EXISTS" }]);
    const read = await storage.read({ profile, key: first, signal });
    if (read.kind !== "found") throw new Error("Object missing");
    const original = await new Response(read.source).text();
    expect(["first", "other"]).toContain(original);
    expect((await put(first, "overwrite")).toJSON()).toMatchObject({
      tag: "Error",
      error: "OBJECT_EXISTS",
    });
    for (const key of keys.slice(1))
      expect((await put(key, "content")).isOk()).toBe(true);
    const listed: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await storage.list({ profile, prefix, cursor, limit: 1 });
      expect(page.objects).toHaveLength(1);
      listed.push(...page.objects.map((object) => object.key));
      cursor = page.cursor;
    } while (cursor);
    expect(listed.sort()).toEqual([...keys].sort());
    const requestedExpiresAt = Date.now() + 60000;
    const signed = storage.signPlayback({
      profile,
      key: first,
      expiresAt: requestedExpiresAt,
    });
    if (signed.kind !== "signed")
      throw new Error("Playback window unexpectedly expired");
    expect(signed.expiresAt).toBe(signatureDeadline(signed.url));
    expect(signed.expiresAt).toBeLessThanOrEqual(requestedExpiresAt);
    expect(signed.expiresAt).toBeGreaterThan(Date.now());
    expect(new URL(signed.url).origin).toBe(selected.playbackEndpoint);
    const response = await fetch(signed.url, {
      ...playbackOptions,
      headers: { range: "bytes=1-3" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-3/5");
    expect(await response.text()).toBe(original.slice(1, 4));
    const unsigned = new URL(signed.url);
    unsigned.search = "";
    const denied = await fetch(unsigned, playbackOptions);
    expect(denied.status).toBe(403);
    await denied.body?.cancel();
    const internal = new Bun.S3Client({
      endpoint: selected.endpoint,
      bucket: selected.bucket,
      accessKeyId: selected.accessKeyId,
      secretAccessKey: selected.secretAccessKey,
      region: selected.region,
    });
    const internalRead = await fetch(internal.presign(first));
    expect(internalRead.status).toBe(200);
    expect(await internalRead.text()).toBe(original);
    for (const key of keys) await storage.delete({ profile, key });
    expect(await storage.read({ profile, key: first, signal })).toEqual({
      kind: "missing",
    });
  } finally {
    try {
      await Promise.all(keys.map((key) => storage.delete({ profile, key })));
    } finally {
      await egress.stop();
    }
  }
});

test("fresh production final Blobs publish through real storage/read/inspection and preserve every supplied byte", async () => {
  const { createNativePublicationFixture } = await import(
    "./lib/native-publication"
  );
  const { publishStory } = await import(
    "../../../apps/be-insta/src/domains/stories/index"
  );
  const { default: provenance } = await import(
    "../../fixtures/media/webm/fresh/provenance.json"
  );
  const fixture = await createNativePublicationFixture();
  try {
    for (const capture of provenance.records) {
      const actorId = fixture.actor();
      const result = await publishStory(
        {
          actor: { userId: actorId },
          operationId: crypto.randomUUID(),
          file: async () => ({
            source: Bun.file(
              new URL(
                `../../fixtures/media/webm/fresh/${capture.file}`,
                import.meta.url,
              ),
            ).stream(),
            complete: Promise.resolve(),
          }),
        },
        fixture.dependencies,
      );
      expect(result.isOk()).toBe(true);
      if (result.isError())
        throw Error(`Fresh capture failed: ${capture.file}`);
      const upload = await fixture.db
        .collection<UploadDocument>(storyCollections.uploads)
        .findOne({ actorId });
      if (!upload) throw Error("Persisted native upload missing");
      expect(upload.status.state).toBe("published");
      const stored = await fixture.dependencies.storage.read({
        profile: upload.profile,
        key: upload.key,
        signal: new AbortController().signal,
      });
      if (stored.kind !== "found") throw Error("Published object missing");
      const bytes = new Uint8Array(
        await new Response(stored.source).arrayBuffer(),
      );
      expect(Bun.CryptoHasher.hash("sha256", bytes, "hex")).toBe(
        capture.sha256,
      );
      expect(bytes.length).toBe(capture.bytes);
      expect(result.get().durationMs).toBeLessThanOrEqual(15000);
    }
  } finally {
    await fixture.dispose();
  }
});

test("fresh invalid native objects persist typed failure and are compensated only after acknowledged provider deletion", async () => {
  const { createNativePublicationFixture } = await import(
    "./lib/native-publication"
  );
  const { publishStory } = await import(
    "../../../apps/be-insta/src/domains/stories/index"
  );
  const { parseWebm } = await import(
    "../../../apps/be-insta/src/domains/stories/adapters/media/webm/parse"
  );
  const { one } = await import(
    "../../../apps/be-insta/src/domains/stories/adapters/media/webm/reader"
  );
  const { ebmlId } = await import(
    "../../../apps/be-insta/src/domains/stories/adapters/media/webm/conts"
  );
  const { cleanupExpired } = await import(
    "../../../apps/be-insta/src/domains/stories/use-cases/cleanup"
  );
  const read = (name: string) =>
    Bun.file(
      new URL(`../../fixtures/media/webm/fresh/${name}.webm`, import.meta.url),
    ).bytes();
  const streaming = await read("chrome-vp8-streaming-short");
  const segment = one(parseWebm(streaming), ebmlId.segment);
  const lastCluster = segment.children
    .filter((node) => node.id === ebmlId.cluster)
    .at(-1);
  const lastBlock = lastCluster?.children
    .filter((node) => node.id === ebmlId.simpleBlock)
    .at(-1);
  if (!lastBlock) throw Error("Native fixture final Block missing");
  const indexed = await read("msedge-vp8-default-short");
  const seek = one(
    one(one(parseWebm(indexed), ebmlId.segment).children, ebmlId.seekHead)
      .children,
    ebmlId.seek,
  );
  const position = one(seek.children, ebmlId.seekPosition);
  const brokenIndex = indexed.slice();
  brokenIndex[position.end - 1] = (brokenIndex[position.end - 1] ?? 0) ^ 1;
  const cases = [
    ["over15", await read("chrome-over15"), "TOO_LONG"],
    ["edge-over15", await read("msedge-over15"), "TOO_LONG"],
    ["forged1s", await read("chrome-shortaudio-forged"), "TOO_LONG"],
    ["edge-forged1s", await read("msedge-shortaudio-forged"), "TOO_LONG"],
    ["partial-block", streaming.slice(0, lastBlock.end - 1), "MALFORMED_MEDIA"],
    ["truncated-parent", indexed.slice(0, -3), "MALFORMED_MEDIA"],
    ["index-corrupt", brokenIndex, "MALFORMED_MEDIA"],
    ["oversize", new Uint8Array(20971521), "FILE_TOO_LARGE"],
  ] as const;
  const fixture = await createNativePublicationFixture();
  try {
    for (const [name, bytes, code] of cases) {
      const actorId = fixture.actor();
      const operationId = crypto.randomUUID();
      const result = await publishStory(
        {
          actor: { userId: actorId },
          operationId,
          file: async () => ({
            source: new Blob([bytes]).stream(),
            complete: Promise.resolve(),
          }),
        },
        fixture.dependencies,
      );
      expect(result.toJSON()).toMatchObject({ tag: "Error", error: code });
      const uploads = fixture.db.collection<UploadDocument>(
        storyCollections.uploads,
      );
      const upload = await uploads.findOne({ actorId, operationId });
      if (!upload) throw Error(`Persisted rejection missing: ${name}`);
      expect(upload.status).toMatchObject({ state: "failed", code });
      expect(
        await fixture.db
          .collection(storyCollections.stories)
          .countDocuments({ actorId }),
      ).toBe(0);
      expect(
        await fixture.db
          .collection(storyCollections.outbox)
          .countDocuments({ actorId }),
      ).toBe(0);
      const object = await fixture.dependencies.storage.read({
        profile: upload.profile,
        key: upload.key,
        signal: new AbortController().signal,
      });
      expect(object.kind).toBe(code === "FILE_TOO_LARGE" ? "missing" : "found");
      if (object.kind === "found") await object.source.cancel();
      const account = await fixture.claimRejected({ actorId, operationId });
      const compensated = await cleanupExpired(
        { now: Date.now() },
        {
          storage: fixture.dependencies.storage,
          cleanup: {
            ...fixture.dependencies.cleanup,
            // The test controls only admission of this owned failed account.
            // Real provider deletion and production Mongo acknowledgement remain intact.
            claim: async () => [account],
          },
        },
      );
      expect(compensated).toEqual({ removed: 1, failed: 0 });
      expect(
        (await uploads.findOne({ actorId, operationId }))?.physicalState,
      ).toBe("removed");
      expect(
        await fixture.dependencies.storage.read({
          profile: upload.profile,
          key: upload.key,
          signal: new AbortController().signal,
        }),
      ).toEqual({ kind: "missing" });
      console.log(
        JSON.stringify({
          nativeCase: name,
          outcome: code,
          persistedFailure: true,
          noStoryOrOutbox: true,
          acknowledgedCleanup: true,
          objectMissing: true,
        }),
      );
    }
  } finally {
    await fixture.dispose();
  }
});

test("reduced upload policy preserves persisted native media and original expiry", async () => {
  const { createNativePublicationFixture } = await import(
    "./lib/native-publication"
  );
  const { publishStory } = await import(
    "../../../apps/be-insta/src/domains/stories/index"
  );
  const fixture = await createNativePublicationFixture();
  try {
    const actorId = fixture.actor();
    const policy = {
      ...fixture.dependencies.policy,
      maxDurationMs: 15000,
      lifetimeMs: 86400000,
    };
    const original = { ...fixture.dependencies, policy };
    const file = async () => ({
      source: Bun.file(
        new URL(
          "../../fixtures/media/webm/chrome-margin.webm",
          import.meta.url,
        ),
      ).stream(),
      complete: Promise.resolve(),
    });
    const first = await publishStory(
      { actor: { userId: actorId }, operationId: crypto.randomUUID(), file },
      original,
    );
    if (first.isError()) throw Error(first.getError());
    const story = first.get();
    expect(story.durationMs).toBeGreaterThan(14000);
    expect(story.expiresAt - story.publishedAt).toBe(86400000);
    const reduced = {
      ...original,
      policy: { ...policy, maxDurationMs: 10000, lifetimeMs: 1000 },
    };
    expect((await reduced.persistence.findStory(story.id))?.story).toEqual(
      story,
    );
    const { playbackStory } = await import(
      "../../../apps/be-insta/src/domains/stories/use-cases/playback"
    );
    const playback = await playbackStory(story.id, reduced);
    if (playback.isError()) throw Error(playback.getError());
    expect(playback.get().expiresAt).toBeLessThanOrEqual(story.expiresAt);
    expect(
      (
        await publishStory(
          {
            actor: { userId: actorId },
            operationId: crypto.randomUUID(),
            file,
          },
          reduced,
        )
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "TOO_LONG" });
    expect((await reduced.persistence.findStory(story.id))?.story).toEqual(
      story,
    );
    expect(
      (
        await playbackStory(story.id, {
          ...reduced,
          clock: () => story.expiresAt,
        })
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "STORY_NOT_FOUND" });
  } finally {
    await fixture.dispose();
  }
});
