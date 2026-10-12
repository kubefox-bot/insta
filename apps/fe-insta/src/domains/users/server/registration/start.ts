import {
  CommonErrorCode,
  RegistrationErrorCode,
} from "@insta/contracts/errors";
import { startRegistrationMutationRequestSchema } from "../../../../lib/api/generated/schemas/startRegistrationSchema";
import { authReply } from "../transport/reply";
import { writeRegistration } from "./cookie";
import { registrationBackendFailure, registrationFailure } from "./reply";
import type { RegistrationStep } from "./types";
/**
 * Создаёт operationId для email challenge, после успеха сохраняет этап verify в защищённой
 * cookie; backend-отказ не переводит форму на следующий этап.
 */
export const startRegistrationStep = async ({
  values,
  input,
  dependencies,
}: RegistrationStep) => {
  const { registration, context, cookieKey } = dependencies;
  const validated = startRegistrationMutationRequestSchema.safeParse({
    email: values.email,
    operationId: crypto.randomUUID(),
  });
  if (!validated.success)
    return registrationFailure(CommonErrorCode.ValidationFailed, context);
  const result = await registration.start(validated.data);
  if (result.isError())
    return registrationBackendFailure(result.getError(), context);
  const challenge = result.get();
  await writeRegistration({
    state: {
      stage: "verify",
      email: validated.data.email,
      challengeId: challenge.challengeId,
      expiresAt: challenge.registrationExpiresAt,
    },
    key: cookieKey,
    cookies: input.cookies,
    origin: input.origin,
  });
  return authReply(
    { stage: "verify", expiresAt: challenge.registrationExpiresAt },
    context,
  );
};
/**
 * Повторяет challenge только из этапа verify, используя email защищённого состояния; иначе
 * возвращает registration_expired.
 */
export const resendRegistrationStep = (step: RegistrationStep) => {
  if (step.state?.stage !== "verify")
    return Promise.resolve(
      registrationFailure(
        RegistrationErrorCode.RegistrationExpired,
        step.dependencies.context,
      ),
    );
  return startRegistrationStep({
    ...step,
    values: { email: step.state.email },
  });
};
