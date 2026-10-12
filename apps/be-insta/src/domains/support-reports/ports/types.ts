import type { SupportDependencies } from "./dependencies";
import type { Email } from "./email";
import type { Jobs } from "./jobs";
import type { Limits } from "./limits";
import type { Proof } from "./proof";
import type { Reports } from "./reports";

export type FormContextDependencies = Readonly<{
  limits: Pick<Limits, "consume">;
  proof: Pick<Proof, "issue">;
}> &
  Pick<SupportDependencies, "clock" | "uuid">;
export type MailDispatchDependencies = Readonly<{
  reports: Pick<Reports, "recover" | "claim" | "finish">;
  jobs: Pick<Jobs, "next" | "acknowledge">;
  email: Email;
}> &
  Pick<SupportDependencies, "clock" | "uuid">;
export type MailWorkerDependencies = MailDispatchDependencies &
  Readonly<{
    reports: MailDispatchDependencies["reports"] & Pick<Reports, "cleanup">;
  }>;

export type MailDispatchSummary = Readonly<{ accepted: number; retry: number }>;
