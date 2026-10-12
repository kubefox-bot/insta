import type { Result } from "@bloodyowl/boxed";
import type { Actor } from "../../users/index";
export type Membership = Readonly<{
  permits: (
    input: Readonly<{
      actorId: string;
      conversationId: string;
      signal?: AbortSignal;
    }>,
  ) => Promise<boolean>;
}>;
export type DeliveryAuthorization = (
  input: Readonly<{ actor: Actor; signal: AbortSignal }>,
) => Promise<Result<Actor, string>>;
