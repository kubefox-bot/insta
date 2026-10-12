import {
  CommonErrorCode,
  RegistrationErrorCode,
} from "@insta/contracts/errors";
import { verifyRegistrationMutationRequestSchema } from "../../../../lib/api/generated/schemas/verifyRegistrationSchema";
import { authReply } from "../transport/reply";
import { registrationCookieName } from "./conts";
import { writeRegistration } from "./cookie";
import { registrationBackendFailure, registrationFailure } from "./reply";
import type { RegistrationStep } from "./types";
/**
 * Проверяет код только для verify-состояния; существующему аккаунту очищает cookie и
 * предлагает login, новому сохраняет setup с proof и устойчивыми ключами завершения.
 */
export const verifyRegistrationStep = async ({
  values,
  state,
  input,
  dependencies,
}: RegistrationStep) => {
  const { registration, context, cookieKey } = dependencies;
  if (state?.stage !== "verify")
    return registrationFailure(
      RegistrationErrorCode.RegistrationExpired,
      context,
    );
  const validated = verifyRegistrationMutationRequestSchema.safeParse({
    challengeId: state.challengeId,
    code: values.code,
  });
  if (!validated.success)
    return registrationFailure(CommonErrorCode.ValidationFailed, context);
  const result = await registration.verify(validated.data);
  if (result.isError())
    return registrationBackendFailure(result.getError(), context);
  const verified = result.get();
  if (verified.status === "login_required") {
    input.cookies.delete(registrationCookieName, { path: "/" });
    return authReply({ stage: "login" }, context);
  }
  await writeRegistration({
    state: {
      stage: "setup",
      proof: verified.registrationProof,
      expiresAt: verified.expiresAt,
      operationId: crypto.randomUUID(),
      key: crypto.randomUUID(),
    },
    key: cookieKey,
    cookies: input.cookies,
    origin: input.origin,
  });
  return authReply({ stage: "setup", expiresAt: verified.expiresAt }, context);
};
