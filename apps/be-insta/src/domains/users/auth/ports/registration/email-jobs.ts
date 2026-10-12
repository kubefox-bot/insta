export type EmailJob = Readonly<{
  id: string;
  challengeId: string;
  version: string;
  generation: string;
}>;
export type EmailJobs = Readonly<{
  next: () => Promise<EmailJob | null>;
  prepare: (job: EmailJob) => Promise<
    | Readonly<{
        state: "ready";
        ciphertext: string;
        expiresAt: number;
        errors: number;
      }>
    | Readonly<{ state: "exhausted" }>
    | null
  >;
  finish: (
    job: EmailJob,
    outcome: "accepted" | "stale" | "failed",
  ) => Promise<void>;
  retry: (job: EmailJob) => Promise<void>;
}>;
export type EmailSender = Readonly<{
  send: (
    input: Readonly<{
      email: string;
      code: string;
      messageId: string;
      expiresAt: number;
      errorsRemaining: number;
      now: number;
    }>,
  ) => Promise<"accepted">;
}>;
