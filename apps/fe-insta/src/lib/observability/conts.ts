import { logFields } from "@insta/fe-core/observability/contracts";
export const identity = {
  app: "insta",
  [logFields.serviceName]: "fe-insta",
  source: "server",
} as const;
