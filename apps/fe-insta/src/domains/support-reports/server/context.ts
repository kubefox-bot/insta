import { CommonErrorCode, SupportErrorCode } from "@insta/contracts/errors";
import { issueSupportContext200Schema } from "../../../lib/api/generated/schemas/issueSupportContextSchema";
import type { CookieRequest } from "../../../lib/http/server/index";
import { acceptsCookieMutation } from "../../../lib/http/server/index";
import { supportCookie } from "./conts";
import { sealSupportScope } from "./cookie";
import { supportFailure } from "./reply";
import type { SupportServerDependencies } from "./types";
/**
 * Выдаёт scope формы после проверки origin и доступности identity, связывает его с текущим
 * пользователем в зашифрованной cookie; браузер получает только scopeId.
 */
export const issueSupportRequest = async (
  input: CookieRequest,
  dependencies: SupportServerDependencies,
) => {
  if (!acceptsCookieMutation(input))
    return supportFailure(CommonErrorCode.Forbidden, dependencies.context);
  try {
    const identity = await dependencies.identity(input);
    if (identity.unavailable)
      return supportFailure(
        SupportErrorCode.SupportIdentityUnavailable,
        dependencies.context,
      );
    const response = await dependencies.backend.context();
    if (!response.ok) return response;
    const parsed = issueSupportContext200Schema.parse(await response.json());
    const scope = {
      scopeId: dependencies.uuid(),
      proof: parsed.data.proof,
      userId: identity.userId,
      expiresAt: parsed.data.expiresAt,
    };
    input.cookies.set(
      supportCookie.name,
      await sealSupportScope({ scope, key: dependencies.key }),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: supportCookie.maxAgeSeconds,
      },
    );
    return Response.json(
      {
        ok: true,
        data: { scopeId: scope.scopeId },
        meta: dependencies.context,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return supportFailure(
      SupportErrorCode.SupportUnavailable,
      dependencies.context,
    );
  }
};
