import type { Actor, Intent, ResumeTarget } from "../domain/types";
export type Targets = Readonly<{
  resolve: (
    input: Readonly<{ intent: Intent; actor: Actor }>,
  ) => Promise<ResumeTarget | undefined>;
}>;
