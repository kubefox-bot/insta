import type { Result } from "@bloodyowl/boxed";
import type {
  SupportFailure,
  SupportReceipt,
  SupportSubmission,
} from "../../domain/types";

export type SupportFormTransport = Readonly<{
  openSupportForm: (signal: AbortSignal) => Promise<string>;
  submitSupport: (
    input: SupportSubmission,
    signal: AbortSignal,
  ) => Promise<Result<SupportReceipt, SupportFailure>>;
}>;
