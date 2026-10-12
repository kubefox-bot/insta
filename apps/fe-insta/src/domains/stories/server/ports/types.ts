import type { Correlation } from "@insta/contracts/http";

export type StoryBackendFailure = Readonly<{
  code: string;
  status: number;
  retryAfter?: string | undefined;
  meta?: Readonly<Pick<Correlation, "requestId" | "operationId">>;
}>;
