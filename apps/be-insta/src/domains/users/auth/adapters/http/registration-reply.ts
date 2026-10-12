import type { Correlation } from "@insta/contracts/http";
import type { NativeResponse } from "../../../../../lib/http/index";
import type { RegistrationError } from "../../domain/registration/types";
import { registrationStatus } from "./conts";
/**
 * Устанавливает HTTP-статус отказа регистрации и формирует безопасный error envelope с
 * корреляцией запроса.
 */
export const registrationFailure = ({
  code,
  response,
  meta,
}: Readonly<{
  code: RegistrationError;
  response: NativeResponse;
  meta: Correlation;
}>) => {
  response.status(registrationStatus[code]);
  return {
    ok: false as const,
    error: { code, message: "Registration failed" },
    meta,
  };
};
