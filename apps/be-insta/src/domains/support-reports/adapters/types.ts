import type { MailDispatchSummary } from "../ports/types";

export type DeliveryHealthInput = Readonly<{
  previous: "ok" | "degraded";
  summary: MailDispatchSummary;
}>;
