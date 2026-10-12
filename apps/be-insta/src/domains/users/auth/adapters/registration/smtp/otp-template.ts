import { formatDateTime } from "@insta/fe-core/dates";
import type { EmailSender } from "../../../ports/registration/email-jobs";
import { expiryPresentation, smtpPolicy } from "./conts";
/**
 * Формирует русское OTP-письмо со сроком, остатком ошибок и предупреждением, что resend
 * не продлевает регистрацию.
 */
export const otpTemplate = (input: Parameters<EmailSender["send"]>[0]) => ({
  subject: "Код подтверждения Insta",
  text: `Код подтверждения: ${input.code}\nРегистрация доступна до ${formatExpiry(input.expiresAt)}.\nОсталось не более ${Math.max(0, Math.ceil((input.expiresAt - input.now) / smtpPolicy.millisecondsPerMinute))} минут и ${input.errorsRemaining} ошибок ввода.\nПовторный запрос не продлевает срок. Действует только последний код.\nЕсли ты не запрашивал регистрацию, проигнорируй письмо.`,
});

/**
 * Форматирует deadline по политике отображения письма; неподдерживаемое время вызывает
 * RangeError вместо пустого срока.
 */
const formatExpiry = (timestampMs: number): string => {
  const formatted = formatDateTime({ timestampMs, ...expiryPresentation });
  if (formatted === null) throw new RangeError("Invalid time value");
  return formatted;
};
