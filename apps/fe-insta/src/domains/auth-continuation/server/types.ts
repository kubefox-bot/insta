import type { Cookies } from "@sveltejs/kit";
import type { Actor } from "../domain/types";
import type { Intents } from "../ports/intents";
import type { Targets } from "../ports/targets";
export type ContinuationRequest = Readonly<{
  request: Request;
  origin: string;
  cookies: Cookies;
  intentId?: string;
  operation: "create" | "resume" | "cancel";
}>;
export type ContinuationDependencies = Readonly<{
  intents: Intents;
  targets: Targets;
  key: Uint8Array;
  actor?: Actor;
  registrationExpiresAt?: number;
}>;
