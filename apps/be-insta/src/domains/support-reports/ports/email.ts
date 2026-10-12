import type { MailJob } from "../domain/types";
export type Email = Readonly<{ send: (job: MailJob) => Promise<"accepted"> }>;
