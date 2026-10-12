import type { PublicPreference } from "@insta/contracts/privacy";
import type { IntakeOutcome } from "../client/types";

export type PayloadIntakeInput = Readonly<{
  payload: unknown;
  preference: PublicPreference;
}>;
export type PayloadIntakeOutcome = Exclude<IntakeOutcome, "rate_limited">;
export type StandaloneIntakeInput = PayloadIntakeInput &
  Readonly<{ source: string }>;
export type HttpIntakeInput = Readonly<{
  request: Request;
  readPreference: () => Promise<PublicPreference>;
  source: string;
  protocol: "client" | "faro";
}>;
