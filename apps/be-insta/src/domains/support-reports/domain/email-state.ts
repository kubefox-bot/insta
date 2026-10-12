import { supportPolicy } from "./conts";
/**
 * Сохраняет accepted при принятии письма SMTP; неудачу оставляет pending до исчерпания
 * попыток, затем отмечает failed.
 */
export const emailStateAfterAttempt = (
  input: Readonly<{ state: "accepted" | "retry"; attempts: number }>,
) => {
  if (input.state === "accepted") return "accepted";
  return input.attempts >= supportPolicy.attempts ? "failed" : "pending";
};
