import { otpPolicy } from "../domain/registration/conts";
import type { RegistrationCrypto } from "../ports/registration/crypto";
import type { EmailJobs, EmailSender } from "../ports/registration/email-jobs";
/**
 * Забирает одно письмо, проверяет актуальность и ждёт SMTP перед ACK; ошибка отправки
 * планирует retry, сбой после принятия оставляет pending job доступным reclaim.
 */
export const deliverCode = async ({
  jobs,
  crypto,
  sender,
  clock,
}: Readonly<{
  jobs: EmailJobs;
  crypto: RegistrationCrypto;
  sender: EmailSender;
  clock: () => number;
}>) => {
  const job = await jobs.next();
  if (!job) return "idle" as const;
  const payload = await jobs.prepare(job);
  if (!payload) {
    await jobs.finish(job, "stale");
    return "stale" as const;
  }
  if (payload.state === "exhausted") {
    await jobs.finish(job, "failed");
    return "failed" as const;
  }
  try {
    const mail = await crypto.openMail(payload.ciphertext);
    await sender.send({
      ...mail,
      messageId: job.version,
      expiresAt: payload.expiresAt,
      errorsRemaining: otpPolicy.errors - payload.errors,
      now: clock(),
    });
  } catch {
    await jobs.retry(job);
    return "retry" as const;
  }
  // Crash/unknown result here deliberately leaves the pending job reclaimable.
  await jobs.finish(job, "accepted");
  return "accepted" as const;
};
