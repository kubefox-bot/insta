import type { Email } from "../ports/email";
import type { Reports } from "../ports/reports";
/**
 * Захватывает отчёт по lease, отправляет письмо и сохраняет accepted либо retry. Accepted
 * означает принятие SMTP, не доставку во входящие; ошибка finish оставляет восстановление
 * persistence.
 */
export const sendEmail = async (
  input: Readonly<{ reportId: string }>,
  dependencies: Readonly<{
    reports: Pick<Reports, "claim" | "finish">;
    email: Email;
    clock: () => number;
    uuid: () => string;
  }>,
) => {
  const job = await dependencies.reports.claim({
    reportId: input.reportId,
    now: dependencies.clock(),
    leaseId: dependencies.uuid(),
  });
  if (!job) return "idle" as const;
  if (job.expiresAt <= dependencies.clock()) return "expired" as const;
  const outcome = await dependencies.email.send(job).then(
    () => "accepted" as const,
    () => "retry" as const,
  );
  await dependencies.reports.finish({
    job,
    state: outcome,
    now: dependencies.clock(),
  });
  return outcome;
};
