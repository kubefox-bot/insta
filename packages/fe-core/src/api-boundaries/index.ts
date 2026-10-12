export { checkApiBoundaries as runApiBoundariesCheck } from "./check-api-boundaries.ts";
export { ApiBoundaryConfigError } from "./config.ts";
export { apiBoundaryRules, apiBoundaryScopedExceptionRules } from "./conts.ts";
export type {
  ApiBoundaryConfig,
  ApiBoundaryFinding,
  ApiBoundaryResult,
  ApiBoundaryRule,
  ApiBoundaryScopedException,
  ApiBoundaryScopedExceptionRule,
} from "./types.ts";
