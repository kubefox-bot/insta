export type {
  SupportFailure,
  SupportIssue,
  SupportReceipt,
  SupportSubmission,
} from "../domain/types";

import type { Readable } from "svelte/store";
import type { Attempt, FormScope, SupportIssue } from "../domain/types";
import type { SupportFormTransport } from "./ports/interfaces";

export type SupportFormView = Readonly<{
  scope: FormScope;
  attempt: Attempt;
  uncertain: boolean;
  canSubmit: boolean;
}>;
export type SupportFormInput = Readonly<{
  comment: string;
  issue: SupportIssue;
}>;
export type SupportFormDependencies = Readonly<{
  transport: SupportFormTransport;
  uuid: () => string;
}>;
export type SupportForm = Readonly<{
  view: Readable<SupportFormView>;
  ensureContext: () => Promise<void>;
  submit: (input: SupportFormInput) => Promise<void>;
  newReport: () => Promise<void>;
  dispose: () => void;
}>;
