import { CommonErrorCode, SessionErrorCode } from "@insta/contracts/errors";
import { loginMutationRequestSchema } from "../../../../lib/api/generated/schemas/loginSchema";
import {
  acceptsCookieMutation,
  serverErrorStatus,
} from "../../../../lib/http/server/index";
import { establishSession } from "../lib/establish";
import type { AuthRequest, AuthTransportDependencies } from "../types";
import { authFailure, authReply } from "./reply";
/**
 * Проверяет origin и JSON данных входа, получает credentials и устанавливает web-сессию;
 * клиентские отказы backend сохраняет, серверные сбои отображает как недоступность сессии.
 */
export const loginRequest = async (
  { request, origin, cookies }: AuthRequest,
  dependencies: AuthTransportDependencies,
) => {
  const { context, backend } = dependencies;
  if (!acceptsCookieMutation({ request, origin }))
    return authFailure(CommonErrorCode.Forbidden, context);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return authFailure(CommonErrorCode.ValidationFailed, context);
  const input = loginMutationRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return authFailure(CommonErrorCode.ValidationFailed, context);
  const credentials = await backend.login(input.data);
  if (credentials.isError()) {
    const error = credentials.getError();
    return authFailure(
      error.kind === "api" && error.status < serverErrorStatus
        ? error.error.code
        : SessionErrorCode.SessionUnavailable,
      context,
    );
  }
  const established = await establishSession(
    { credentials: credentials.get(), cookies, origin },
    dependencies,
  );
  return established.isOk()
    ? authReply(established.get(), context)
    : authFailure(established.getError(), context);
};
