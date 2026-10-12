import type {
  MailDispatchDependencies,
  MailDispatchSummary,
} from "../ports/types";
import { sendEmail } from "./send-email";
/**
 * Объединяет сигнал Streams с durable recovery без повторов и отправляет отчёты
 * последовательно. Abort прекращает новые отправки после текущей; подтверждение сигнала
 * не заменяет сохранённое состояние отчёта.
 */
export const dispatchSupportMail = async (
  dependencies: MailDispatchDependencies,
  signal: AbortSignal,
): Promise<MailDispatchSummary> => {
  const summary = { accepted: 0, retry: 0 };
  const queued = await dependencies.jobs.next().catch(() => null);
  const pending = await dependencies.reports.recover(dependencies.clock());
  for (const reportId of new Set([
    ...(queued ? [queued.reportId] : []),
    ...pending,
  ])) {
    if (signal.aborted) break;
    const outcome = await sendEmail({ reportId }, dependencies);
    switch (outcome) {
      case "accepted":
      case "retry":
        summary[outcome] += 1;
        break;
      case "idle":
      case "expired":
        break;
      default: {
        const unreachable: never = outcome;
        throw new Error(`Unexpected mail outcome: ${unreachable}`);
      }
    }
  }
  if (queued)
    await dependencies.jobs.acknowledge(queued.id).catch(() => undefined);
  return summary;
};
