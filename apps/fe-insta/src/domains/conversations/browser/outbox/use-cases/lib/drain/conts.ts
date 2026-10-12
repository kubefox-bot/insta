import type { DrainSummary } from "../../../domain/types";
export const emptySummary = {
  sent: 0,
  confirmed: 0,
  needsConfirmation: 0,
} as const satisfies DrainSummary;
