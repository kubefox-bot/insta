import { createSmtpTransport } from "../../../../lib/smtp/index";
import type { Email } from "../../ports/email";
import { supportMail } from "./conts";
import { supportTemplate } from "./template";
/**
 * Создаёт SMTP transport для support и отдаёт его close владельцу lifecycle; письма
 * адресуются настроенному получателю.
 */
export const createSupportEmail = (
  config: Readonly<{ host: string; port: number; recipient: string }>,
) => {
  const transport = createSmtpTransport(config);
  const email: Email = {
    /**
     * Отправляет экранированное обращение со стабильным Message-ID отчёта; завершение
     * означает принятие транспортом, а не inbox delivery.
     */
    send: (job) =>
      transport.send({
        from: supportMail.from,
        to: config.recipient,
        messageId: `<${job.reportId}@${supportMail.domain}>`,
        subject: supportMail.subject,
        ...supportTemplate(job),
      }),
  };
  return { ...email, close: transport.close };
};
