import type { correlationSchema } from "@insta/contracts/http";
import type { z } from "zod";
export type ApiFailure<Error = unknown> =
  | { readonly kind: "network" }
  | {
      readonly kind: "invalid_contract";
      readonly status?: number;
      readonly meta?: z.infer<typeof correlationSchema>;
    }
  | {
      readonly kind: "api";
      readonly status: number;
      readonly error: Error;
      readonly meta: z.infer<typeof correlationSchema>;
    };
export type ApiConfiguration = {
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
};
export type RequestContext = {
  readonly requestId?: string;
  readonly operationId?: string;
  readonly consentProof?: string;
};
export type RequestConfig<Data = unknown> = {
  readonly url?: string;
  readonly method?:
    | "GET"
    | "PUT"
    | "PATCH"
    | "POST"
    | "DELETE"
    | "OPTIONS"
    | "HEAD";
  readonly data?: Data | FormData;
  readonly params?: unknown;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
};
export type ResponseConfig<_Data = unknown> = Response;
export type ResponseErrorConfig<Error = unknown> = Error;
export type Client = <Data, _Error = unknown, Input = unknown>(
  request: RequestConfig<Input>,
) => Promise<ResponseConfig<Data>>;
