import type { QueuedMessage, SendOutcome } from "../domain/types";
export type Sender = (
  record: QueuedMessage,
  options?: Readonly<{ signal?: AbortSignal }>,
) => Promise<SendOutcome>;
export type SendHttp = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
