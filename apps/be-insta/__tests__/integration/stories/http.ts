import { expect } from "bun:test";
import { request as nativeRequest } from "node:http";
import { Result } from "@bloodyowl/boxed";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { createApplication } from "../../../src/app/bootstrap";
import { storyCollections } from "../../../src/domains/stories/adapters/mongo/conts";
import {
  createFeedReader,
  createStoryPublisherLifetime,
  type StoryDependencies,
} from "../../../src/domains/stories/index";
import { createStoriesPersistence } from "../../../src/domains/stories/server/index";
import { sessionCredentialsSchema } from "../../../src/domains/users/auth/domain/credentials";
import { login } from "../../../src/domains/users/index";
import {
  connectDragonfly,
  createActorQuota,
} from "../../../src/lib/dragonfly/index";

const f = await createAuthEnvironment();
const quotaConfig = readTestApiConfig();
const broker = await connectDragonfly({ config: quotaConfig.dragonfly });
const quotaNamespace = `stories-http-${crypto.randomUUID()}`;
const actors: string[] = [];
try {
  const persistence = await createStoriesPersistence({
    db: f.database.apiDb,
    startSession: f.database.startSession,
  });
  const objects = new Map<string, Uint8Array>();
  const uploadGate = {
    hold: false,
    calls: 0,
    entered: Promise.withResolvers<void>(),
    release: Promise.withResolvers<void>(),
  };
  const dependencies: StoryDependencies = {
    refreshFeed: async () => "deferred",
    policy: {
      maxDurationMs: 15000,
      lifetimeMs: 86400000,
      maxFileBytes: 20971520,
      captureSafetyMarginMs: 200,
    },
    ...persistence,
    keyPrefix: "stories/",
    activeProfile: "test",
    clock: Date.now,
    uuid: () => crypto.randomUUID(),
    authors: {
      findPublicUser: async ({ id }) =>
        Result.Ok({ id, username: "synthetic" }),
    },
    storage: {
      putUnique: async (input) => {
        objects.set(
          input.key,
          new Uint8Array(await new Response(input.source).arrayBuffer()),
        );
        if (uploadGate.hold) {
          uploadGate.calls++;
          if (uploadGate.calls === 2) uploadGate.entered.resolve();
          await uploadGate.release.promise;
        }
        return Result.Ok({
          profile: input.profile,
          key: input.key,
          byteLength: 3,
        });
      },
      read: async ({ key }) => ({
        kind: "found",
        source: new Blob([new Uint8Array(objects.get(key) ?? [])]).stream(),
      }),
      delete: async () => {
        throw new Error("No compensation");
      },
      list: async () => ({ objects: [] }),
      signPlayback: ({ expiresAt }) => ({
        kind: "signed",
        url: "https://test.invalid",
        expiresAt,
      }),
    },
    media: {
      inspect: async ({ source }) => {
        await source.cancel();
        return Result.Ok({
          container: "mp4",
          videoCodec: "h264",
          audioCodec: "aac",
          durationMs: 1234,
        });
      },
    },
  };
  const lifetime = createStoryPublisherLifetime(dependencies);
  const feedGate = {
    hold: false,
    calls: 0,
    entered: Promise.withResolvers<void>(),
    release: Promise.withResolvers<void>(),
  };
  const feed = createFeedReader({
    stories: {
      list: async (input) => {
        feedGate.calls++;
        const page = await persistence.feed.list(input);
        if (feedGate.hold) {
          if (feedGate.calls === 4) feedGate.entered.resolve();
          await feedGate.release.promise;
        }
        return page;
      },
    },
    authors: dependencies.authors,
    cache: {
      read: async () => {
        throw new Error("Controlled cache-only outage");
      },
      fill: async () => false,
    },
  });
  const stories = {
    status: () => "ok" as const,
    reads: {
      feed,
      quotas: {
        feed: createActorQuota({
          client: broker,
          key: quotaConfig.authLimitsKey,
          namespace: `${quotaNamespace}:feed`,
          maximum: 60,
        }),
        playback: createActorQuota({
          client: broker,
          key: quotaConfig.authLimitsKey,
          namespace: `${quotaNamespace}:playback`,
          maximum: 120,
        }),
      },
    },
    publication: { ...dependencies, publish: lifetime.publish },
    mediaInspector: { ...dependencies.media, close: async () => {} },
    storage: dependencies.storage,
    activeProfile: "test",
    retainedProfiles: ["test"],
    close: lifetime.close,
  };
  const app = await createApplication(
    {
      users: f.users,
      stories,
      checkRequired: async () => true,
      check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
      close: async () => {},
    },
    { mode: "offline" },
  );
  try {
    await app.listen(0, "127.0.0.1");
    const url = await app.getUrl();
    // The client sends headers only, never ending or writing a single body byte.
    for (const pathname of ["/v1/stories", "/v1/Stories", "/v1/stories/"])
      for (const contentType of [
        "multipart/form-data; boundary=s",
        "application/json",
      ]) {
        const denied = await new Promise<number | undefined>(
          (resolve, reject) => {
            const req = nativeRequest(
              `${url}${pathname}`,
              {
                method: "POST",
                headers: {
                  "content-type": contentType,
                  "transfer-encoding": "chunked",
                },
              },
              (res) => {
                clearTimeout(timeout);
                resolve(res.statusCode);
                res.resume();
                req.destroy();
              },
            );
            const timeout = setTimeout(() => {
              reject(new Error("Prebody auth response deadline"));
              req.destroy();
            }, 5000);
            req.on("error", reject);
            req.flushHeaders();
          },
        );
        expect(denied).toBe(401);
      }
    expect(objects.size).toBe(0);
    const account = await f.account();
    const logged = await login(
      { ...account, operationId: f.operation() },
      f.auth,
    );
    if (logged.isError()) throw new Error(logged.getError());
    const credentials = sessionCredentialsSchema.parse(
      logged.get().credentials,
    );
    actors.push(credentials.user.id);
    const headers = {
      authorization: `Bearer ${credentials.accessToken}`,
      "content-type": "multipart/form-data; boundary=s",
    };
    const body = (extra = "") =>
      '--s\r\nContent-Disposition: form-data; name="durationMs"\r\n\r\n1\r\n--s\r\nContent-Disposition: form-data; name="video"; filename="a.mp4"\r\nContent-Type: video/mp4\r\n\r\nabc\r\n' +
      extra +
      "--s--\r\n";
    const operationId = f.operation();
    const response = await fetch(`${url}/v1/stories`, {
      method: "POST",
      headers: { ...headers, "X-Idempotency-Key": operationId },
      body: body(),
    });
    expect(response.status).toBe(200);
    const published = await response.json();
    expect(published.data.durationMs).toBe(1234);
    expect(published.meta.operationId).toBe(operationId);
    expect(JSON.stringify(published)).not.toContain('"key"');
    expect(JSON.stringify(published)).not.toContain('"profile"');
    const replay = await fetch(`${url}/v1/stories`, {
      method: "POST",
      headers: { ...headers, "X-Idempotency-Key": operationId },
      body: "invalid multipart",
    });
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.id).toBe(published.data.id);
    expect(objects.size).toBe(1);
    const second = await fetch(`${url}/v1/stories`, {
      method: "POST",
      headers: { ...headers, "X-Idempotency-Key": f.operation() },
      body: body(
        '--s\r\nContent-Disposition: form-data; name="video"; filename="b.mp4"\r\n\r\nsecond\r\n',
      ),
    });
    expect(second.status).not.toBe(200);
    await second.body?.cancel();
    expect(
      await f.database.apiDb
        .collection(storyCollections.stories)
        .countDocuments({ actorId: credentials.user.id }),
    ).toBe(1);
    expect(
      await f.database.apiDb
        .collection(storyCollections.outbox)
        .countDocuments({ actorId: credentials.user.id }),
    ).toBe(1);
    const status = await fetch(
      `${url}/v1/stories/publications/${operationId}`,
      { headers: { authorization: headers.authorization } },
    );
    expect((await status.json()).data.story.id).toBe(published.data.id);
    uploadGate.hold = true;
    const heldUploads = [1, 2].map(() =>
      fetch(`${url}/v1/stories`, {
        method: "POST",
        headers: { ...headers, "X-Idempotency-Key": f.operation() },
        body: body(),
      }),
    );
    try {
      await uploadGate.entered.promise;
      const busy = await fetch(`${url}/v1/stories`, {
        method: "POST",
        headers: { ...headers, "X-Idempotency-Key": f.operation() },
        body: body(),
      });
      expect(busy.status).toBe(503);
      expect(busy.headers.get("Retry-After")).toBe("60");
      expect((await busy.json()).error.code).toBe("BUSY");
      expect(uploadGate.calls).toBe(2);
    } finally {
      uploadGate.hold = false;
      uploadGate.release.resolve();
      for (const uploaded of await Promise.all(heldUploads)) {
        expect(uploaded.status).toBe(200);
        await uploaded.body?.cancel();
      }
    }
    feedGate.hold = true;
    const held = Array.from({ length: 4 }, () => fetch(`${url}/v1/stories`));
    await feedGate.entered.promise;
    const overloaded = await fetch(`${url}/v1/stories`);
    expect(overloaded.status).toBe(503);
    expect(overloaded.headers.get("Retry-After")).toBe("60");
    await overloaded.body?.cancel();
    expect(feedGate.calls).toBe(4);
    feedGate.release.resolve();
    for (const response of await Promise.all(held)) {
      expect(response.status).toBe(200);
      expect(
        (await response.json()).data.authors.some(
          (group: { author: { id: string } }) =>
            group.author.id === credentials.user.id,
        ),
      ).toBe(true);
    }
    feedGate.hold = false;
    for (const [suffix, maximum, status] of [
      ["", 55, 200],
      [`/${published.data.id}/playback`, 120, 200],
    ] as const) {
      for (let index = 0; index < maximum; index++) {
        const allowed = await fetch(`${url}/v1/stories${suffix}`, {
          headers: { "X-Forwarded-For": `forged-${index}` },
        });
        expect(allowed.status).toBe(status);
        await allowed.body?.cancel();
      }
      const denied = await fetch(`${url}/v1/stories${suffix}`, {
        headers: { "X-Forwarded-For": "another-forged-source" },
      });
      expect(denied.status).toBe(503);
      expect(denied.headers.get("Retry-After")).toBe("60");
      await denied.body?.cancel();
    }
    broker.close();
    const callsBeforeOutage = feedGate.calls;
    expect(
      (
        await stories.reads.quotas.feed.consume("new-source-after-outage")
      ).isError(),
    ).toBe(true);
    const unavailable = await fetch(`${url}/v1/stories`);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Retry-After")).toBe("60");
    await unavailable.body?.cancel();
    expect(feedGate.calls).toBe(callsBeforeOutage);
    await lifetime.close();
  } finally {
    await app.close();
  }
} finally {
  for (const actorId of actors)
    for (const name of Object.values(storyCollections))
      await f.database.apiDb
        .collection<{ _id: string; actorId?: string }>(name)
        .deleteMany(
          name === storyCollections.authors ? { _id: actorId } : { actorId },
        );
  broker.close();
  await f.dispose();
}
console.log(
  JSON.stringify({
    nativePublication: "passed",
    headersOnlyAuthDenial: true,
    oneCanonical: true,
    trailingFileRejected: true,
    finiteUploadAdmission: true,
  }),
);
