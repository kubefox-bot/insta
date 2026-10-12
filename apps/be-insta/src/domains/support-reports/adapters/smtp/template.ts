import type { MailJob } from "../../domain/types";
import { htmlEscapes } from "./conts";
/**
 * Формирует текст письма с идентификаторами обращения и экранированную HTML-версию, не
 * интерпретируя пользовательский комментарий как разметку.
 */
export const supportTemplate = (job: MailJob) => {
  const text = `Report: ${job.reportId}\nError: ${job.errorCode}\nOriginal request: ${job.originalRequestId ?? ""}\n\n${job.comment}`;
  const escaped = text.replace(
    /[&<>"']/g,
    (value) => htmlEscapes[value as keyof typeof htmlEscapes],
  );
  return { text, html: `<pre>${escaped}</pre>` };
};
