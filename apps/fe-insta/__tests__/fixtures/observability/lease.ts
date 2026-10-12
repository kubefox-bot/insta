import {
  createTracing,
  readContext,
} from "@insta/fe-core/observability/server";

export const createLease = () =>
  createTracing({ readPermission: () => "allowed" });

export { readContext };
