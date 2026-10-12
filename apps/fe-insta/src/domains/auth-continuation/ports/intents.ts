import type { Intent } from "../domain/types";
export type Intents = Readonly<{
  create: (intent: Intent) => Promise<boolean>;
  find: (intentId: string) => Promise<Intent | undefined>;
  compare: (
    input: Readonly<{ previous: Intent; next: Intent }>,
  ) => Promise<boolean>;
}>;
