import { expect, test } from "bun:test";
import { createRecorder, type RecordingFinalizer } from "@insta/media-recorder";
import { get, writable } from "svelte/store";
import { finalizeStoryRecording } from "../../../apps/fe-insta/src/domains/stories/browser/adapters/recorder/finalize";
import { createStoryPreview } from "../../../apps/fe-insta/src/domains/stories/browser/preview/create";
import { createStoryRecorder } from "../../../apps/fe-insta/src/domains/stories/browser/recorder";
import { browser } from "../../../packages/media-recorder/__tests__/fixtures/browser";
import { fixture } from "../../../packages/media-recorder/__tests__/webm/fixture";

const setup = (
  finalizeRecording?: RecordingFinalizer,
  outcome?: Promise<
    import("../../../apps/fe-insta/src/domains/stories/browser/publication/types").PublicationOutcome
  >,
) => {
  const native = browser();
  const actor = { userId: "one", generation: "S1" };
  const session = writable<{
    actor: typeof actor | null;
    status: "authenticated" | "guest";
  }>({ actor, status: "authenticated" });
  const calls = { factory: 0, auth: 0, publish: 0 };
  const revoked: string[] = [];
  const created: Blob[] = [];
  const uploaded: Blob[] = [];
  const preview = createStoryPreview({
    urls: {
      create: (blob) => {
        created.push(blob);
        return "blob:owned";
      },
      revoke: (url) => {
        revoked.push(url);
      },
    },
  });
  const recorder = createStoryRecorder({
    preview,
    session,
    recorderFactory: () => {
      calls.factory++;
      return createRecorder({ ...native.options, finalizeRecording });
    },
    continuation: async () => {
      calls.auth++;
    },
    publish: async ({ blob }) => {
      uploaded.push(blob);
      calls.publish++;
      return outcome ?? { kind: "unknown" };
    },
    readPublication: async () => ({ kind: "unknown" }),
    onPublished: async () => {},
    uuid: () => "operation",
  });
  return {
    native,
    actor,
    session,
    calls,
    preview,
    recorder,
    revoked,
    created,
    uploaded,
  };
};
test("opening guest or restored owner never acquires camera and never publishes", async () => {
  const f = setup();
  f.session.set({ actor: null, status: "guest" });
  await f.recorder.open();
  expect(f.calls).toEqual({ factory: 0, auth: 1, publish: 0 });
  f.session.set({ actor: f.actor, status: "authenticated" });
  await f.recorder.open();
  expect(get(f.recorder.view).kind).toBe("ready");
  expect(f.calls.factory).toBe(0);
  await f.recorder.dispose();
});
test("close during permission waits for late provider completion and releases owned stream once", async () => {
  const f = setup();
  await f.recorder.open();
  const opening = f.recorder.enableCamera();
  await Promise.resolve();
  const closing = f.recorder.close();
  f.native.permission.resolve(f.native.stream);
  await opening;
  await closing;
  expect(get(f.recorder.view).kind).toBe("closed");
  expect(f.native.stream.tracks.map((t) => t.stopCalls)).toEqual([1, 1]);
  expect(f.preview.capture()).toBeUndefined();
  await f.recorder.dispose();
});
test("auto stop creates one preview; expiry hides it until explicit same-owner restore; account switch destroys it", async () => {
  const f = setup();
  await f.recorder.open();
  f.native.permission.resolve(f.native.stream);
  await f.recorder.enableCamera();
  f.recorder.start();
  f.native.tick(15000);
  f.native.settle();
  await f.recorder.stop();
  expect(get(f.recorder.view).kind).toBe("preview");
  expect(f.calls.publish).toBe(0);
  const handle = f.preview.capture();
  expect(handle).toBeDefined();
  f.session.set({ actor: null, status: "guest" });
  expect(get(f.recorder.view).kind).toBe("closed");
  f.session.set({
    actor: { ...f.actor, generation: "S2" },
    status: "authenticated",
  });
  await f.recorder.open();
  expect(get(f.recorder.view).kind).toBe("ready");
  if (handle)
    f.preview.restore({
      actor: { ...f.actor, generation: "S2" },
      previewId: handle.previewId,
    });
  expect(get(f.recorder.view).kind).toBe("preview");
  f.session.set({
    actor: { userId: "two", generation: "S3" },
    status: "authenticated",
  });
  expect(f.preview.capture()).toBeUndefined();
  expect(f.revoked).toEqual(["blob:owned", "blob:owned"]);
  await f.recorder.dispose();
});
test.each(["NotAllowedError", "NotReadableError"])(
  "native %s remains camera error with cleanup",
  async (name) => {
    const f = setup();
    await f.recorder.open();
    const opening = f.recorder.enableCamera();
    f.native.permission.reject(new DOMException("synthetic", name));
    await opening;
    expect(get(f.recorder.view).kind).toBe("error");
    expect(f.calls.publish).toBe(0);
    await f.recorder.dispose();
  },
);
test("logout discards an unknown publication and a subsequent owner cannot query the old identity", async () => {
  const f = setup();
  await f.recorder.open();
  f.preview.replace({ actor: f.actor, blob: new Blob(["private"]) });
  await f.recorder.confirmPublish();
  expect(get(f.recorder.view).kind).toBe("checking");
  const captured = f.preview.capture();
  if (captured) f.preview.discard(captured);
  f.session.set({ actor: null, status: "guest" });
  f.session.set({
    actor: { userId: "two", generation: "S2" },
    status: "authenticated",
  });
  await f.recorder.open();
  expect(get(f.recorder.view).kind).toBe("ready");
  await f.recorder.dispose();
});
test("concurrent camera actions acquire exactly one native owner", async () => {
  const f = setup();
  await f.recorder.open();
  const first = f.recorder.enableCamera();
  const second = f.recorder.enableCamera();
  f.native.permission.resolve(f.native.stream);
  await Promise.all([first, second]);
  expect(f.calls.factory).toBe(1);
  await f.recorder.dispose();
  expect(f.native.stream.tracks.map((track) => track.stopCalls)).toEqual([
    1, 1,
  ]);
});
test("unknown-close releases URL, retains the same operation and Blob, and closed status lookup never recreates URL", async () => {
  const f = setup();
  await f.recorder.open();
  const blob = new Blob(["original"]);
  f.preview.replace({ actor: f.actor, blob });
  await f.recorder.confirmPublish();
  await f.recorder.close();
  expect(f.revoked).toEqual(["blob:owned"]);
  expect(f.preview.read(f.actor)?.blob).toBe(blob);
  expect(f.preview.read(f.actor)?.url).toBeUndefined();
  await f.recorder.checkPublication();
  expect(f.preview.read(f.actor)?.url).toBeUndefined();
  await f.recorder.open();
  expect(get(f.recorder.view)).toMatchObject({
    kind: "checking",
    operationId: "operation",
  });
  expect(f.preview.read(f.actor)?.blob).toBe(blob);
  await f.recorder.confirmPublish();
  expect(f.calls.publish).toBe(1);
  await f.recorder.dispose();
});

test("delayed metadata repair keeps preview unavailable until final Blob then uploads that same Blob only on confirm", async () => {
  const barrier = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const f = setup(async (recording) => {
    entered.resolve();
    await barrier.promise;
    return finalizeStoryRecording(recording);
  });
  await f.recorder.open();
  f.native.permission.resolve(f.native.stream);
  await f.recorder.enableCamera();
  f.recorder.start();
  f.native.time.now = 980;
  const stopping = f.recorder.stop();
  const original = fixture();
  f.native.events.current?.data(original.blob);
  f.native.events.current?.stop();
  await entered.promise;
  expect(f.created).toEqual([]);
  await f.recorder.confirmPublish();
  expect(f.uploaded).toEqual([]);
  barrier.resolve();
  await stopping;
  const final = f.preview.read(f.actor)?.blob;
  expect(final?.size).toBe(original.blob.size + 11);
  if (!final) throw new Error("Missing finalized preview");
  expect(f.created[0]).toBe(final);
  expect(f.uploaded).toEqual([]);
  await f.recorder.confirmPublish();
  expect(f.uploaded[0]).toBe(final);
  await f.recorder.dispose();
  expect(f.revoked).toEqual(["blob:owned"]);
});

test.each(["dispose", "logout", "generation"] as const)(
  "%s during finalization waits/fences result and never recreates preview",
  async (action) => {
    const barrier = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const f = setup(async (recording) => {
      entered.resolve();
      await barrier.promise;
      return finalizeStoryRecording(recording);
    });
    await f.recorder.open();
    f.native.permission.resolve(f.native.stream);
    await f.recorder.enableCamera();
    f.recorder.start();
    f.native.time.now = 900;
    const stopping = f.recorder.stop();
    f.native.events.current?.data(fixture().blob);
    f.native.events.current?.stop();
    await entered.promise;
    const disposal = action === "dispose" ? f.recorder.dispose() : undefined;
    if (action === "logout") f.session.set({ actor: null, status: "guest" });
    if (action === "generation") {
      f.session.set({
        actor: { ...f.actor, generation: "S2" },
        status: "authenticated",
      });
      await f.recorder.open();
    }
    let disposed = false;
    disposal?.then(() => {
      disposed = true;
    });
    await Promise.resolve();
    if (action === "dispose") expect(disposed).toBe(false);
    barrier.resolve();
    await stopping;
    await disposal;
    expect(f.preview.capture()).toBeUndefined();
    expect(f.created).toEqual([]);
    expect(f.uploaded).toEqual([]);
    await f.recorder.dispose();
    expect(f.native.stream.tracks.map((track) => track.stopCalls)).toEqual([
      1, 1,
    ]);
    expect(f.native.counts.listeners).toBe(0);
    expect(f.native.counts.visibility).toBe(0);
  },
);

test("failed metadata repair never offers the original Blob; retake allows explicit new attempt", async () => {
  const f = setup(finalizeStoryRecording);
  await f.recorder.open();
  f.native.permission.resolve(f.native.stream);
  await f.recorder.enableCamera();
  f.recorder.start();
  f.native.time.now = 900;
  const stopping = f.recorder.stop();
  f.native.settle();
  await stopping;
  expect(get(f.recorder.view)).toEqual({
    kind: "error",
    code: "finalization-failed",
  });
  expect(f.created).toEqual([]);
  await f.recorder.confirmPublish();
  expect(f.uploaded).toEqual([]);
  await f.recorder.retake();
  expect(get(f.recorder.view).kind).toBe("ready");
  await f.recorder.dispose();
});

test("retake revokes a repaired preview and never retains it for subsequent publication", async () => {
  const f = setup(finalizeStoryRecording);
  await f.recorder.open();
  f.native.permission.resolve(f.native.stream);
  await f.recorder.enableCamera();
  f.recorder.start();
  f.native.time.now = 900;
  const stopping = f.recorder.stop();
  f.native.events.current?.data(fixture().blob);
  f.native.events.current?.stop();
  await stopping;
  expect(f.created).toHaveLength(1);
  await f.recorder.retake();
  expect(f.preview.capture()).toBeUndefined();
  expect(f.revoked).toEqual(["blob:owned"]);
  await f.recorder.confirmPublish();
  expect(f.uploaded).toEqual([]);
  await f.recorder.dispose();
  expect(f.revoked).toEqual(["blob:owned"]);
});

test("hidden preview reopens the same bytes without enabling camera", async () => {
  const f = setup();
  await f.recorder.open();
  const blob = new Blob(["ready"]);
  f.preview.replace({ actor: f.actor, blob });
  await f.recorder.setHidden(true);
  expect(f.preview.read(f.actor)?.url).toBeUndefined();
  await f.recorder.setHidden(false);
  expect(get(f.recorder.view).kind).toBe("preview");
  expect(f.preview.read(f.actor)?.blob).toBe(blob);
  expect(f.calls.factory).toBe(0);
  await f.recorder.dispose();
});
test("hidden stop settles resources and fences late finalization", async () => {
  const barrier = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const f = setup(async (recording) => {
    entered.resolve();
    await barrier.promise;
    return finalizeStoryRecording(recording);
  });
  await f.recorder.open();
  f.native.permission.resolve(f.native.stream);
  await f.recorder.enableCamera();
  f.recorder.start();
  f.native.time.now = 900;
  const stopping = f.recorder.stop();
  f.native.events.current?.data(fixture().blob);
  f.native.events.current?.stop();
  await entered.promise;
  let settled = false;
  const hiding = f.recorder.setHidden(true).then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(f.native.stream.tracks.map((track) => track.stopCalls)).toEqual([
    1, 1,
  ]);
  barrier.resolve();
  await stopping;
  await hiding;
  await f.recorder.setHidden(false);
  expect(get(f.recorder.view)).toMatchObject({
    kind: "ready",
    cameraDisabled: true,
  });
  expect(f.preview.capture()).toBeUndefined();
  await f.recorder.dispose();
});
test("visibility restoration never opens the new actor", async () => {
  const f = setup();
  await f.recorder.open();
  f.preview.replace({ actor: f.actor, blob: new Blob(["private"]) });
  await f.recorder.setHidden(true);
  f.session.set({
    actor: { userId: "two", generation: "S2" },
    status: "authenticated",
  });
  await f.recorder.setHidden(false);
  expect(get(f.recorder.view).kind).toBe("closed");
  expect(f.preview.capture()).toBeUndefined();
  await f.recorder.dispose();
});

test("hidden upload ignores its late result and reconciles the original operation without duplicate POST", async () => {
  const upload =
    Promise.withResolvers<
      import("../../../apps/fe-insta/src/domains/stories/browser/publication/types").PublicationOutcome
    >();
  const actor = { userId: "one", generation: "S1" };
  const session = writable({ actor, status: "authenticated" });
  const preview = createStoryPreview({
    urls: { create: () => "blob:owned", revoke: () => {} },
  });
  const calls = { posts: 0, published: 0 };
  const queried: string[] = [];
  const recorder = createStoryRecorder({
    session,
    preview,
    recorderFactory: () => {
      throw new Error("Camera must stay off");
    },
    continuation: async () => {},
    uuid: () => "original-operation",
    publish: async () => {
      calls.posts++;
      return upload.promise;
    },
    readPublication: async ({ operationId }) => {
      queried.push(operationId);
      return { kind: "known", operationId, state: "published" };
    },
    onPublished: async () => {
      calls.published++;
    },
  });
  await recorder.open();
  const blob = new Blob(["original"]);
  preview.replace({ actor, blob });
  const publishing = recorder.confirmPublish();
  await recorder.confirmPublish();
  expect(calls.posts).toBe(1);
  await recorder.setHidden(true);
  expect(recorder.hasPendingPublication()).toBe(true);
  upload.resolve({ kind: "published" });
  await publishing;
  expect(calls.published).toBe(0);
  await recorder.setHidden(false);
  expect(get(recorder.view)).toMatchObject({
    kind: "checking",
    operationId: "original-operation",
  });
  expect(preview.read(actor)?.blob).toBe(blob);
  await recorder.checkPublication();
  expect(queried).toEqual(["original-operation"]);
  expect(calls).toEqual({ posts: 1, published: 1 });
  expect(preview.capture()).toBeUndefined();
  await recorder.dispose();
});

test("late publication callback cannot publish or discard a new actor's preview", async () => {
  const outcome =
    Promise.withResolvers<
      import("../../../apps/fe-insta/src/domains/stories/browser/publication/types").PublicationOutcome
    >();
  const f = setup(undefined, outcome.promise);
  await f.recorder.open();
  f.preview.replace({ actor: f.actor, blob: new Blob(["private old"]) });
  const publishing = f.recorder.confirmPublish();
  const next = { userId: "two", generation: "S2" };
  f.session.set({ actor: next, status: "authenticated" });
  await f.recorder.open();
  const blob = new Blob(["new owner"]);
  f.preview.replace({ actor: next, blob });
  outcome.resolve({ kind: "published" });
  await publishing;
  expect(get(f.recorder.view).kind).toBe("preview");
  expect(f.preview.read(next)?.blob).toBe(blob);
  expect(f.calls.publish).toBe(1);
  await f.recorder.dispose();
});

test("navigation suspension while visibility restoration waits cannot reopen the departed recorder", async () => {
  const barrier = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const f = setup(async (recording) => {
    entered.resolve();
    await barrier.promise;
    return finalizeStoryRecording(recording);
  });
  await f.recorder.open();
  f.native.permission.resolve(f.native.stream);
  await f.recorder.enableCamera();
  f.recorder.start();
  f.native.time.now = 900;
  const stop = f.recorder.stop();
  f.native.events.current?.data(fixture().blob);
  f.native.events.current?.stop();
  await entered.promise;
  const hide = f.recorder.setHidden(true);
  const restore = f.recorder.setHidden(false);
  const leave = f.recorder.suspend();
  barrier.resolve();
  await Promise.all([stop, hide, restore, leave]);
  expect(get(f.recorder.view).kind).toBe("closed");
  await f.recorder.dispose();
});

test("another hide while visibility restoration waits stays closed until the next show", async () => {
  const barrier = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const f = setup(async (recording) => {
    entered.resolve();
    await barrier.promise;
    return finalizeStoryRecording(recording);
  });
  await f.recorder.open();
  f.native.permission.resolve(f.native.stream);
  await f.recorder.enableCamera();
  f.recorder.start();
  f.native.time.now = 900;
  const stop = f.recorder.stop();
  f.native.events.current?.data(fixture().blob);
  f.native.events.current?.stop();
  await entered.promise;
  const hide = f.recorder.setHidden(true);
  const restore = f.recorder.setHidden(false);
  const hideAgain = f.recorder.setHidden(true);
  barrier.resolve();
  await Promise.all([stop, hide, restore, hideAgain]);
  expect(get(f.recorder.view).kind).toBe("closed");
  await f.recorder.setHidden(false);
  expect(get(f.recorder.view).kind).not.toBe("closed");
  await f.recorder.dispose();
});
