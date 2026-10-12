import type { Binding, RefreshAttempt } from "../types";
export type FinishRefresh = Readonly<{
  bindingId: string;
  revision: number;
  key: string;
  leaseGeneration: number;
  now: number;
  outcome:
    | Readonly<{
        kind: "success";
        credentials: string;
        accessExpiresAt: number;
        expiresAt: number;
      }>
    | Readonly<{ kind: "rejected" | "unknown" }>;
}>;
export type SessionStore = Readonly<{
  create: (binding: Binding) => Promise<void>;
  read: (bindingId: string) => Promise<Binding | null>;
  beginRefresh: (
    input: Readonly<{
      bindingId: string;
      revision: number;
      attempt: RefreshAttempt;
      now: number;
    }>,
  ) => Promise<Binding | null>;
  takeOver: (
    input: Readonly<{ binding: Binding; leaseOwner: string; now: number }>,
  ) => Promise<Binding | null>;
  finishRefresh: (input: FinishRefresh) => Promise<boolean>;
  block: (
    input: Readonly<{ bindingId: string; backendSessionId: string }>,
  ) => Promise<void>;
  expire: (
    input: Readonly<{ bindingId: string; revision: number; now: number }>,
  ) => Promise<void>;
  beginRevocation: (
    input: Readonly<{ bindingId: string; key: string; now: number }>,
  ) => Promise<Binding | null>;
  pendingRevocations: (now: number) => Promise<ReadonlyArray<Binding>>;
  finishRevocation: (
    input: Readonly<{
      bindingId: string;
      key: string;
      failures: number;
      nextAttemptAt: number;
      confirmed: boolean;
    }>,
  ) => Promise<void>;
}>;
