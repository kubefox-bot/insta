import { RegistrationErrorCode } from "@insta/contracts/errors";
import { serverErrorStatus } from "../../../../lib/http/server/index";
import { registrationStatus } from "./conts";
import type { RegistrationDependencies } from "./types";
/**
 * Возвращает некешируемый отказ регистрации с корреляцией; неизвестный код использует статус
 * registration_unavailable.
 */
export const registrationFailure = (
  code: string,
  context: RegistrationDependencies["context"],
) =>
  Response.json(
    { ok: false, error: { code, message: code }, meta: context },
    {
      status:
        registrationStatus[code as keyof typeof registrationStatus] ??
        registrationStatus.REGISTRATION_UNAVAILABLE,
      headers: { "Cache-Control": "no-store" },
    },
  );
/**
 * Сохраняет клиентский код ошибки API, а сетевой или серверный сбой отображает как
 * недоступность регистрации.
 */
export const registrationBackendFailure = (
  error: Readonly<{
    kind: string;
    status?: number;
    error?: Readonly<{ code: string }>;
  }>,
  context: RegistrationDependencies["context"],
) =>
  registrationFailure(
    error.kind === "api" &&
      error.status &&
      error.status < serverErrorStatus &&
      error.error
      ? error.error.code
      : RegistrationErrorCode.RegistrationUnavailable,
    context,
  );
