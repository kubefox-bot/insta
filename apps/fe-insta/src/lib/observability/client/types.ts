import type { z } from "zod";
import type { clientEventSchema, safeFaroBodySchema } from "./schema";
export type ClientEvent = z.infer<typeof clientEventSchema>;
export type SafeFaroBody = z.infer<typeof safeFaroBodySchema>;
export type IntakeOutcome =
  | "accepted"
  | "invalid"
  | "denied"
  | "rate_limited"
  | "unavailable";
export type ClientObservation = ClientEvent &
  Readonly<{ authority: "client_observed" }>;
