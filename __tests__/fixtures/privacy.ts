import type { Preference } from "../../apps/be-insta/src/domains/privacy/domain/types";
export const createMemoryPreferences = () => {
  const records = new Map<string, Preference>();
  const state = {
    fail: false,
    records,
    generation: async () => {
      if (state.fail) throw new Error("offline");
      return "g";
    },
    find: async ({ contextId }: { contextId: string; generation: string }) => {
      if (state.fail) throw new Error("offline");
      return records.get(contextId);
    },
    save: async ({
      preference,
      expectedRevision,
    }: {
      preference: Preference;
      expectedRevision?: number;
      source: string;
      now: number;
    }) => {
      if (state.fail) throw new Error("offline");
      if (records.get(preference.contextId)?.revision !== expectedRevision)
        return "conflict" as const;
      records.set(preference.contextId, preference);
      return "saved" as const;
    },
  };
  return state;
};
