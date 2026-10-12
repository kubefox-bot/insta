import type { Correlation } from "@insta/contracts/http";
import type { NativeResponse } from "../../../../../lib/http/index";
import type { AuthError } from "../../domain/types";
import { authErrorStatus } from "./conts";
/**
 * Формирует HTTP-отказ аутентификации со статусом по коду, корреляцией и запретом
 * кэширования.
 */
export const authFailure = ({
  code,
  response,
  meta,
}: Readonly<{
  code: AuthError;
  response: NativeResponse;
  meta: Correlation;
}>) => {
  response.status(authErrorStatus[code]);
  response.setHeader("Cache-Control", "no-store");
  return {
    ok: false as const,
    error: { code, message: "Authentication failed" },
    meta,
  };
};
