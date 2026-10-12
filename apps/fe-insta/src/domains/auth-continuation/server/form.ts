import { ContinuationErrorCode } from "@insta/contracts/errors";
import type { Cookies } from "@sveltejs/kit";
import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { resumeTargetSchema } from "../domain/target";
import { targetPath } from "../lib/navigation/target-path";
import { continuationHttp, intentStatus } from "./conts";
import type { ContinuationRequest } from "./types";

const formSchema = z.object({
  step: z.enum(["cancel", "resume"]),
  intentId: z.uuid(),
});
/**
 * Проверяет HTML-форму resume/cancel, вызывает continuation transport и после успешного resume
 * перенаправляет только на проверенную внутреннюю цель.
 */
export const continuationForm = async ({
  request,
  origin,
  cookies,
  execute,
}: Readonly<{
  request: Request;
  origin: string;
  cookies: Cookies;
  execute: (input: ContinuationRequest) => Promise<Response>;
}>) => {
  const parsed = formSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );
  if (!parsed.success)
    return fail(intentStatus.INTENT_INVALID, {
      code: ContinuationErrorCode.IntentInvalid,
    });
  const response = await execute({
    request,
    origin,
    cookies,
    intentId: parsed.data.intentId,
    operation: parsed.data.step,
  });
  if (response.ok && parsed.data.step === "resume") {
    const result = z
      .object({ ok: z.literal(true), data: resumeTargetSchema })
      .safeParse(await response.json());
    if (!result.success)
      return fail(intentStatus.INTENT_UNAVAILABLE, {
        code: ContinuationErrorCode.IntentUnavailable,
      });
    redirect(continuationHttp.seeOther, targetPath(result.data.data));
  }
  return response.ok
    ? { cancelled: parsed.data.step === "cancel" }
    : fail(response.status, { code: ContinuationErrorCode.IntentUnavailable });
};
