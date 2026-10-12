import { httpHeaderNames } from "@insta/contracts/http";
import { consentContextHeader } from "@insta/contracts/privacy";

export const contextHeaders = {
  requestId: httpHeaderNames.requestId,
  operationId: httpHeaderNames.operationId,
  consentProof: consentContextHeader,
} as const;
