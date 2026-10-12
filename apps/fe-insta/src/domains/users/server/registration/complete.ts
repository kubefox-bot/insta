import {
  CommonErrorCode,
  RegistrationErrorCode,
} from "@insta/contracts/errors";
import { completeRegistrationMutationRequestSchema } from "../../../../lib/api/generated/schemas/completeRegistrationSchema";
import { establishSession } from "../lib/establish";
import { authFailure, authReply } from "../transport/reply";
import { registrationCookieName } from "./conts";
import { registrationBackendFailure, registrationFailure } from "./reply";
import type { RegistrationStep } from "./types";
/**
 * Завершает setup по proof и стабильным operationId/key из cookie, устанавливает web-сессию и
 * только затем удаляет состояние регистрации; ошибки сохраняют возможность повторного
 * обращения.
 */
export const completeRegistrationStep = async ({
  values,
  state,
  input,
  dependencies,
}: RegistrationStep) => {
  const { registration, context } = dependencies;
  if (state?.stage !== "setup")
    return registrationFailure(
      RegistrationErrorCode.RegistrationProofInvalid,
      context,
    );
  const validated = completeRegistrationMutationRequestSchema.safeParse({
    proof: state.proof,
    username: values.username,
    password: values.password,
    operationId: state.operationId,
  });
  if (!validated.success)
    return registrationFailure(CommonErrorCode.ValidationFailed, context);
  const result = await registration.complete(validated.data, state.key);
  if (result.isError())
    return registrationBackendFailure(result.getError(), context);
  const established = await establishSession(
    { credentials: result.get(), origin: input.origin, cookies: input.cookies },
    dependencies,
  );
  if (established.isError())
    return authFailure(established.getError(), context);
  input.cookies.delete(registrationCookieName, { path: "/" });
  return authReply(
    { stage: "authenticated", actor: established.get() },
    context,
  );
};
