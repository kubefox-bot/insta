import {
  CommonErrorCode,
  SessionErrorCode,
  SupportErrorCode,
} from "@insta/contracts/errors";
import { z } from "zod";
import { submitSupportReportMutationRequestSchema } from "../../../lib/api/generated/schemas/submitSupportReportSchema";
import type { CookieRequest } from "../../../lib/http/server/index";
import { acceptsCookieMutation } from "../../../lib/http/server/index";
import { supportCookie } from "./conts";
import { readSupportScope } from "./cookie";
import { supportFailure } from "./reply";
import type { SupportServerDependencies } from "./types";

const payloadSchema = submitSupportReportMutationRequestSchema
  .omit({ guestContext: true })
  .extend({ scopeId: z.uuid(), idempotencyKey: z.uuid() });
/**
 * Проверяет origin, payload, срок и identity scope, затем отправляет отчёт от пользователя
 * либо с гостевым proof; неопределённый сбой отображает как недоступность поддержки.
 */
export const submitSupportRequest = async (
  input: CookieRequest,
  dependencies: SupportServerDependencies,
) => {
  if (!acceptsCookieMutation(input))
    return supportFailure(CommonErrorCode.Forbidden, dependencies.context);
  try {
    const parsed = payloadSchema.safeParse(await input.request.json());
    if (!parsed.success)
      return supportFailure(
        CommonErrorCode.ValidationFailed,
        dependencies.context,
      );
    const scope = await readSupportScope({
      cookie: input.cookies.get(supportCookie.name),
      key: dependencies.key,
      now: dependencies.clock(),
    });
    if (!scope || scope.scopeId !== parsed.data.scopeId)
      return supportFailure(
        SupportErrorCode.SupportContextInvalid,
        dependencies.context,
      );
    const identity = await dependencies.identity(input);
    if (identity.unavailable)
      return supportFailure(
        SupportErrorCode.SupportIdentityUnavailable,
        dependencies.context,
      );
    if (identity.userId !== scope.userId)
      return supportFailure(
        SessionErrorCode.ActorChanged,
        dependencies.context,
      );
    const { scopeId: _scopeId, idempotencyKey: key, ...payload } = parsed.data;
    if (scope.userId !== null)
      return await dependencies.authorized({
        request: input,
        userId: scope.userId,
        /**
         * Отправляет пользовательский отчёт с полученным токеном и прежним ключом
         * идемпотентности без гостевого доказательства.
         */
        send: (accessToken) =>
          dependencies.backend.submit({ payload, key, accessToken }),
      });
    return await dependencies.backend.submit({
      payload: { ...payload, guestContext: scope.proof },
      key,
    });
  } catch {
    return supportFailure(
      SupportErrorCode.SupportUnavailable,
      dependencies.context,
    );
  }
};
