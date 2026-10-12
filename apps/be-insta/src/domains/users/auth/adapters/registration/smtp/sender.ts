import { createSmtpTransport } from "../../../../../../lib/smtp/index";
import type { EmailSender } from "../../../ports/registration/email-jobs";
import { smtpPolicy } from "./conts";
import { otpTemplate } from "./otp-template";
/**
 * Владеет созданным SMTP transport и отдаёт close вызывающему для shutdown; send означает
 * принятие сервером, а не доставку во входящие.
 */
export const createSmtpSender = (
  config: Readonly<{ host: string; port: number }>,
): EmailSender & Readonly<{ close: () => Promise<void> }> => {
  const transport = createSmtpTransport(config);
  return {
    close: transport.close,
    /**
     * Отклоняет истёкшее письмо до SMTP и отправляет шаблон со стабильным Message-ID
     * версии job.
     */
    send: async (input) => {
      if (input.expiresAt <= input.now)
        throw new Error("Registration mail expired");
      return transport.send({
        from: smtpPolicy.from,
        to: input.email,
        messageId: `<${input.messageId}@${smtpPolicy.messageDomain}>`,
        ...otpTemplate(input),
      });
    },
  };
};
