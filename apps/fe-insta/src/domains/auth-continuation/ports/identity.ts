import type { Actor } from "../domain/types";
export type Identity = Readonly<{
  read: () => Promise<
    | Readonly<{ status: "authenticated"; actor: Actor }>
    | Readonly<{ status: "guest" | "unavailable"; actor: null }>
  >;
  registrationDeadline: () => Promise<number | undefined>;
}>;
