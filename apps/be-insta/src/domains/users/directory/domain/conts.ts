import { directoryQueryLimits } from "@insta/contracts/directory";

export const directoryPolicy = {
  minQueryLength: directoryQueryLimits.min,
  maxQueryLength: directoryQueryLimits.max,
  defaultLimit: 20,
  maxLimit: 50,
  requestsPerMinute: 30,
} as const;
