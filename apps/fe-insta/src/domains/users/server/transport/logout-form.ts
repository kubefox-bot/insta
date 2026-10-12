import { CommonErrorCode, SessionErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import { acceptsCookieMutation } from "../../../../lib/http/server/index";
import { loadSession } from "../load-session";
import type { AuthRequest } from "../types";
import { authFailure } from "./reply";
/**
 * Проверяет origin и ожидаемое поколение формы перед logout; при смене actor или недоступном
 * чтении не вызывает завершение сессии.
 */
export const logoutFormRequest = async (
  input: AuthRequest,
  {
    auth,
    context = {},
  }: Readonly<{
    auth: Readonly<{ session: (input: AuthRequest) => Promise<Response> }>;
    context?: Parameters<typeof authFailure>[1];
  }>,
) => {
  if (!acceptsCookieMutation(input))
    return authFailure(CommonErrorCode.Forbidden, context);
  const expected = z.object({ generation: z.string().min(1) }).safeParse(
    await input.request
      .clone()
      .json()
      .catch(() => undefined),
  );
  if (!expected.success)
    return authFailure(CommonErrorCode.ValidationFailed, context);
  const current = await loadSession({ ...input, auth });
  if (current.status === "unavailable")
    return authFailure(SessionErrorCode.SessionUnavailable, context);
  if (current.actor?.generation !== expected.data.generation)
    return authFailure(SessionErrorCode.ActorChanged, context);
  return auth.session(input);
};
