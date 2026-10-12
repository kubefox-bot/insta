import type { Result } from "@bloodyowl/boxed";
import type { SupportError } from "../domain/types";
export type Limits = Readonly<{
  consume: (
    input: Readonly<{ kind: "owner" | "ip" | "context"; subject: string }>,
  ) => Promise<Result<"allowed" | "limited", SupportError>>;
}>;
