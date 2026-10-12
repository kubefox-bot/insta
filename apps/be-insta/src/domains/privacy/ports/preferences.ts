import type { Preference } from "../domain/types";
export type Preferences = Readonly<{
  generation: () => Promise<string>;
  find: (
    input: Readonly<{ contextId: string; generation: string }>,
  ) => Promise<Preference | undefined>;
  save: (
    input: Readonly<{
      preference: Preference;
      expectedRevision?: number | undefined;
      source: string;
      now: number;
    }>,
  ) => Promise<"saved" | "conflict" | "rateLimited">;
}>;
