import type { z } from "zod";
import type { submitSupportReportMutationRequestSchema } from "../../../lib/api/generated/schemas/submitSupportReportSchema";
import type { RequestContext } from "../../../lib/api/server/index";
import type { CookieRequest } from "../../../lib/http/server/index";
import type { scopeSchema } from "./cookie";
export type SupportPayload = z.infer<
  typeof submitSupportReportMutationRequestSchema
>;
export type SupportBackend = Readonly<{
  context: () => Promise<Response>;
  submit: (
    input: Readonly<{
      payload: SupportPayload;
      key: string;
      accessToken?: string;
    }>,
  ) => Promise<Response>;
}>;
export type SupportServerDependencies = Readonly<{
  backend: SupportBackend;
  key: Uint8Array;
  context: RequestContext;
  clock: () => number;
  uuid: () => string;
  identity: (
    input: CookieRequest,
  ) => Promise<Readonly<{ userId: string | null; unavailable: boolean }>>;
  authorized: (
    input: Readonly<{
      request: CookieRequest;
      userId: string;
      send: (token: string) => Promise<Response>;
    }>,
  ) => Promise<Response>;
}>;
export type SupportScope = z.infer<typeof scopeSchema>;
