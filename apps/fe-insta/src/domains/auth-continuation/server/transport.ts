import { ContinuationErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import { cancelRequest } from "./cancel";
import { createRequest } from "./create";
import { intentFailure } from "./reply";
import { resumeRequest } from "./resolve-resume";
import type { ContinuationDependencies, ContinuationRequest } from "./types";
/**
 * Проверяет UUID для resume/cancel и направляет запрос владельцу операции; origin и identity
 * проверяются внешним authorize-слоем.
 */
export const continuationRequest = async (
  input: ContinuationRequest,
  dependencies: ContinuationDependencies,
) => {
  if (
    input.operation !== "create" &&
    !z.uuid().safeParse(input.intentId).success
  )
    return intentFailure(ContinuationErrorCode.IntentInvalid);
  const handlers = {
    create: createRequest,
    resume: resumeRequest,
    cancel: cancelRequest,
  };
  return handlers[input.operation](input, dependencies);
};
