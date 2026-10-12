import { breakpoints } from "./conts.ts";

export const mediaQueries = {
  compact: `(width < ${breakpoints.splitViewMin})`,
  split: `(width >= ${breakpoints.splitViewMin})`,
} as const;
