import type { Correlation } from "@insta/contracts/http";
import { PasswordAdmissionError } from "../domain/password-admission";
import type { AuthAdmissionFailure } from "../domain/types";
import { authHttpErrors } from "./conts";
/**
 * Переводит password capacity, rate limit и unavailable в HTTP envelope с Retry-After; не
 * изменяет response и сохраняет корреляцию.
 */
export const authAdmissionReply = ({
  failure,
  meta,
}: Readonly<{
  failure: PasswordAdmissionError | AuthAdmissionFailure;
  meta: Correlation;
}>) => {
  const policy =
    failure instanceof PasswordAdmissionError
      ? authHttpErrors.busy
      : authHttpErrors[failure.state];
  const retryAfterSeconds =
    "retryAfterSeconds" in failure
      ? failure.retryAfterSeconds
      : authHttpErrors.unavailable.retryAfterSeconds;
  return {
    status: policy.status,
    headers: { "Retry-After": String(retryAfterSeconds) },
    body: {
      ok: false as const,
      error: { code: policy.code, message: policy.message },
      meta,
    },
  };
};
