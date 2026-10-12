import type { GoalMapping } from "@insta/fe-core/observability/analytics";
import { authBusinessCatalog } from "./conts";
export const authGoalCatalog: readonly GoalMapping[] = Object.values(
  authBusinessCatalog,
).map((value) => ({
  operation: value.operation,
  successCodes: [value.code],
  authority: "server_canonical",
  goal: value.goal,
}));
export { authBusinessCatalog } from "./conts";
