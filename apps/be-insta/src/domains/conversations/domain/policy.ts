import { conversationLimits } from "./conts";
import { historyPolicy } from "./history/conts";

export const conversationPolicy = {
  ...historyPolicy,
  ...conversationLimits,
} as const;
