import type { GoalMapping } from "@insta/fe-core/observability/analytics";
import { supportBusiness } from "./conts";
export const supportGoalCatalog: readonly GoalMapping[] = [
  { ...supportBusiness, successCodes: [supportBusiness.code] },
];
