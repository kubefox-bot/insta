import type { Result } from "@bloodyowl/boxed";
export type ReadQuota = Readonly<{
  consume: (
    actorId: string,
  ) => Promise<Result<"allowed" | "limited", "unavailable">>;
}>;
