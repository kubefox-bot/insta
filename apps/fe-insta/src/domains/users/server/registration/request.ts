import { CommonErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import { acceptsCookieMutation } from "../../../../lib/http/server/index";
import { authFailure } from "../transport/reply";
import type { AuthRequest } from "../types";
import { completeRegistrationStep } from "./complete";
import { registrationCookieName } from "./conts";
import { readRegistration } from "./cookie";
import { resendRegistrationStep, startRegistrationStep } from "./start";
import type { RegistrationDependencies } from "./types";
import { verifyRegistrationStep } from "./verify";

const inputSchema = z
  .object({ step: z.enum(["start", "resend", "verify", "complete"]) })
  .passthrough();
/**
 * Проверяет origin и выбранный этап, расшифровывает актуальное состояние регистрации и
 * передаёт выполнение владельцу start/resend/verify/complete.
 */
export const registrationRequest = async (
  input: AuthRequest,
  dependencies: RegistrationDependencies,
) => {
  if (!acceptsCookieMutation(input))
    return authFailure(CommonErrorCode.Forbidden, dependencies.context);
  const parsed = inputSchema.safeParse(
    await input.request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return authFailure(CommonErrorCode.ValidationFailed, dependencies.context);
  const state = await readRegistration({
    cookie: input.cookies.get(registrationCookieName),
    key: dependencies.cookieKey,
    now: Date.now(),
  });
  const handlers = {
    start: startRegistrationStep,
    resend: resendRegistrationStep,
    verify: verifyRegistrationStep,
    complete: completeRegistrationStep,
  };
  return handlers[parsed.data.step]({
    values: parsed.data,
    state,
    input,
    dependencies,
  });
};
