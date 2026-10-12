import { expect, test } from "bun:test";
import { storyCollections } from "../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import { createStoryMaintenance } from "../../../apps/be-insta/src/domains/stories/index";
import {
  createStoriesPersistence,
  createStoryStorage,
} from "../../../apps/be-insta/src/domains/stories/server/index";
import { readStoriesConfig } from "../../../apps/be-insta/src/lib/config/stories/read";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import { readTestApiConfig } from "../../fixtures/environment";
import { readStoriesTestConfig } from "../../fixtures/media/config";

test("retained profile inventory failure preserves its durable cursor while healthy actual provider profiles progress within one concurrency budget", async () => {
  const config = readStoriesConfig(readStoriesTestConfig());
  if (config.mode !== "enabled") throw new Error("Stories profile required");
  const original = config.profiles.find(
    (profile) => profile.id === config.activeProfile,
  );
  if (!original) throw new Error("Profile missing");
  const run = crypto.randomUUID();
  const profiles = ["failed", "healthy", "later"].map((name) => ({
    ...original,
    id: `maintenance-${run}-${name}`,
    prefix: `${original.prefix}${run}/${name}/`,
  }));
  const failed = profiles[0];
  if (!failed) throw new Error("Failed profile missing");
  const storage = createStoryStorage({ profiles, clock: Date.now });
  const database = await connectDatabase({ config: readTestApiConfig().mongo });
  const persistence = await createStoriesPersistence({
    db: database.apiDb,
    startSession: database.startSession,
  });
  const signal = new AbortController().signal;
  const objects = profiles.flatMap((profile) =>
    Array.from({ length: 5 }, (_, index) => ({
      profile: profile.id,
      key: `${profile.prefix}${index}.mp4`,
    })),
  );
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const visited: string[] = [];
  let active = 0;
  let maximum = 0;
  const maintenance = createStoryMaintenance({
    ...persistence,
    profiles,
    clock: () => 100,
    invalidate: async () => {},
    ownership: {
      ...persistence.ownership,
      read: async (input) => {
        active++;
        maximum = Math.max(maximum, active);
        try {
          const outcome = await persistence.ownership.read(input);
          if (active === 4) reached.resolve();
          await release.promise;
          return outcome;
        } finally {
          active--;
        }
      },
    },
    storage: {
      ...storage,
      list: async (input) => {
        visited.push(input.profile);
        if (input.profile === failed.id)
          throw new Error("Controlled retained provider inventory outage");
        return storage.list(input);
      },
    },
  });
  try {
    await Promise.all(
      objects.map(async (object) => {
        expect(
          (
            await storage.putUnique({
              ...object,
              source: new Blob(["synthetic orphan"]).stream(),
              maxBytes: 100,
              signal,
            })
          ).isOk(),
        ).toBe(true);
      }),
    );
    await persistence.ownership.advance({
      profile: failed.id,
      cursor: "retained-cursor",
    });
    const pending = maintenance.reconcile(signal).then(
      () => ({ kind: "resolved" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    );
    await reached.promise;
    expect(active).toBe(4);
    expect(visited).toEqual(profiles.slice(0, 2).map((profile) => profile.id));
    release.resolve();
    const outcome = await pending;
    expect(outcome.kind).toBe("rejected");
    if (
      outcome.kind !== "rejected" ||
      !(outcome.error instanceof AggregateError)
    )
      throw new Error("Expected aggregated provider failure");
    expect(outcome.error.errors).toHaveLength(1);
    expect(visited).toEqual(profiles.map((profile) => profile.id));
    expect(maximum).toBe(4);
    expect(await persistence.ownership.cursor(failed.id)).toBe(
      "retained-cursor",
    );
    for (const profile of profiles.slice(1))
      expect(await persistence.ownership.cursor(profile.id)).toBeNull();
    await Promise.all(
      objects.map(async (object) => {
        const stored = await storage.read({ ...object, signal });
        expect(stored.kind).toBe(
          object.profile === failed.id ? "found" : "missing",
        );
        if (stored.kind === "found") await new Response(stored.source).text();
      }),
    );
  } finally {
    release.resolve();
    for (const object of objects) await storage.delete(object);
    await database.apiDb
      .collection<{ _id: string }>(storyCollections.reconcile)
      .deleteMany({ _id: { $in: profiles.map((profile) => profile.id) } });
    await database.close();
  }
}, 30000);
