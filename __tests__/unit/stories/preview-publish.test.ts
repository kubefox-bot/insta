import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createStoryPreview } from "../../../apps/fe-insta/src/domains/stories/browser/preview/create";
import { createPublication } from "../../../apps/fe-insta/src/domains/stories/browser/publish";

const actor = { userId: "one", generation: "S1" };
const setup = () => {
  const revoked: string[] = [];
  const preview = createStoryPreview({
    uuid: () => "preview",
    urls: {
      create: () => "blob:owned",
      revoke: (url) => {
        revoked.push(url);
      },
    },
  });
  preview.replace({
    actor,
    blob: new Blob(["private"], { type: "video/mp4" }),
  });
  const calls: string[] = [];
  const remote = {
    state: "unknown" as
      | "unknown"
      | "pending"
      | "not_found"
      | "failed"
      | "published",
  };
  const publication = createPublication({
    preview,
    actor: () => actor,
    uuid: () => "operation",
    publish: async ({ operationId }) => {
      calls.push(operationId);
      return { kind: "unknown" };
    },
    readPublication: async ({ operationId }) =>
      remote.state === "unknown"
        ? { kind: "unknown" }
        : { kind: "known", state: remote.state, operationId },
    onPublished: async () => {
      calls.push("refresh");
    },
    onAuthentication: async () => {
      calls.push("auth");
    },
  });
  return { preview, revoked, calls, remote, publication };
};

test("preview resource access requires current actor generation and restores explicitly", () => {
  const { preview } = setup();
  expect(preview.read(actor)?.blob.size).toBe(7);
  expect(preview.read({ ...actor, generation: "S2" })).toBeUndefined();
  expect(preview.read({ ...actor, userId: "two" })).toBeUndefined();
  preview.restore({
    actor: { ...actor, generation: "S2" },
    previewId: "preview",
  });
  expect(preview.read({ ...actor, generation: "S2" })?.url).toBe("blob:owned");
});
test("unknown lookup and pending never cause blind upload; not_found retry keeps operation identity", async () => {
  const { publication, calls, remote } = setup();
  await publication.confirm();
  expect(get(publication.view)).toEqual({
    kind: "checking",
    operationId: "operation",
    status: "unknown",
  });
  await publication.confirm();
  expect(calls).toEqual(["operation"]);
  remote.state = "pending";
  await publication.check();
  await publication.confirm();
  expect(calls).toEqual(["operation"]);
  remote.state = "not_found";
  await publication.check();
  await publication.confirm();
  expect(calls).toEqual(["operation", "operation"]);
});
test("owner published outcome refreshes once and releases preview; late duplicate does nothing", async () => {
  const { publication, calls, remote, preview, revoked } = setup();
  await publication.confirm();
  remote.state = "published";
  await publication.check();
  await publication.check();
  expect(get(publication.view).kind).toBe("published");
  expect(calls).toEqual(["operation", "refresh"]);
  expect(preview.capture()).toBeUndefined();
  expect(revoked).toEqual(["blob:owned"]);
});
test("authoritative failed outcome retains editable preview and releases operation for a deliberate new attempt", async () => {
  const { publication, remote, preview } = setup();
  await publication.confirm();
  remote.state = "failed";
  await publication.check();
  expect(get(publication.view).kind).toBe("rejected");
  expect(preview.read(actor)).toBeDefined();
  expect(publication.canRetake()).toBe(true);
});
test("cancel after dispatch preserves unknown identity until owner status settles", async () => {
  const { publication, calls } = setup();
  await publication.confirm();
  publication.cancel();
  await publication.confirm();
  expect(get(publication.view).kind).toBe("checking");
  expect(calls).toEqual(["operation"]);
});
test("feed refresh failure cannot erase a confirmed successful publication", async () => {
  const f = setup();
  const p = createPublication({
    preview: f.preview,
    actor: () => actor,
    uuid: () => "operation",
    publish: async () => ({ kind: "published" }),
    readPublication: async () => ({ kind: "unknown" }),
    onPublished: async () => {
      throw new Error("feed unavailable");
    },
    onAuthentication: async () => {},
  });
  await p.confirm();
  expect(get(p.view).kind).toBe("published");
  expect(f.preview.capture()).toBeUndefined();
});
test("late published result cannot refresh or revoke a newer actor resource", async () => {
  const f = setup();
  const response = Promise.withResolvers<{ kind: "published" }>();
  const calls: string[] = [];
  const p = createPublication({
    preview: f.preview,
    actor: () => actor,
    uuid: () => "operation",
    publish: () => response.promise,
    readPublication: async () => ({ kind: "unknown" }),
    onPublished: async () => {
      calls.push("refresh");
    },
    onAuthentication: async () => {},
  });
  const sending = p.confirm();
  p.reset();
  f.preview.replace({
    actor: { userId: "two", generation: "S2" },
    blob: new Blob(["next"]),
  });
  response.resolve({ kind: "published" });
  await sending;
  expect(calls).toEqual([]);
  expect(f.preview.capture()?.actor.userId).toBe("two");
});

test("concealing unknown preview revokes its URL while retaining the original bounded Blob; only current owner reopen creates a fresh URL", () => {
  const revoked: string[] = [];
  const created: Blob[] = [];
  const preview = createStoryPreview({
    urls: {
      create: (blob) => {
        created.push(blob);
        return `blob:${created.length}`;
      },
      revoke: (url) => {
        revoked.push(url);
      },
    },
  });
  const blob = new Blob(["private"]);
  preview.replace({ actor, blob });
  preview.conceal();
  expect(revoked).toEqual(["blob:1"]);
  expect(preview.read(actor)?.url).toBeUndefined();
  expect(preview.read(actor)?.blob).toBe(blob);
  expect(preview.reopen({ ...actor, userId: "two" })).toBeUndefined();
  expect(created).toHaveLength(1);
  expect(preview.reopen(actor)?.url).toBe("blob:2");
  expect(created[1]).toBe(blob);
  preview.dispose();
  expect(revoked).toEqual(["blob:1", "blob:2"]);
});
test("oversized preview cannot dispatch an unknown upload or enter retained operation state", async () => {
  const f = setup();
  f.preview.replace({ actor, blob: new Blob([new Uint8Array(20971521)]) });
  await f.publication.confirm();
  expect(get(f.publication.view)).toEqual({
    kind: "rejected",
    code: "FILE_TOO_LARGE",
  });
  expect(f.calls).toEqual([]);
});
