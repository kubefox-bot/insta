export type CleanupAccount = Readonly<{
  id: string;
  token: string;
  profile: string;
  key: string;
}>;
export interface StoryCleanup {
  readonly claim: (
    input: Readonly<{
      now: number;
      limit: number;
      signal?: AbortSignal | undefined;
    }>,
  ) => Promise<readonly CleanupAccount[]>;
  readonly acknowledge: (input: CleanupAccount) => Promise<void>;
  readonly retry: (
    input: CleanupAccount & Readonly<{ now: number }>,
  ) => Promise<void>;
}
export interface StoryOwnership {
  readonly read: (
    input: Readonly<{ profile: string; key: string }>,
  ) => Promise<Readonly<{ kind: "found" | "missing" | "error" }>>;
  readonly cursor: (profile: string) => Promise<string | null>;
  readonly advance: (
    input: Readonly<{ profile: string; cursor: string | null }>,
  ) => Promise<void>;
}
export interface StoryOutbox {
  readonly pending: () => Promise<readonly string[]>;
  readonly acknowledge: (id: string) => Promise<void>;
}
