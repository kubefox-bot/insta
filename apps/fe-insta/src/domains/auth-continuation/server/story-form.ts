import {
  CommonErrorCode,
  ContinuationErrorCode,
} from "@insta/contracts/errors";
import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { acceptsCookieMutation } from "../../../lib/http/server/index";
import { resumeTargetSchema } from "../domain/target";
import { authPath } from "../lib/navigation/auth-path";
import { targetPath } from "../lib/navigation/target-path";
import { continuationHttp, intentStatus } from "./conts";
import type { ContinuationRequest } from "./types";
/**
 * После проверки origin создаёт Stories-intent и пытается разрешить его: проверенную
 * Stories-цель открывает сразу, иначе ведёт на login с тем же intentId.
 */
export const storyForm = async (
  { request, origin, cookies }: Omit<ContinuationRequest, "operation">,
  execute: (input: ContinuationRequest) => Promise<Response>,
) => {
  if (!acceptsCookieMutation({ request, origin }))
    return fail(continuationHttp.forbidden, {
      code: CommonErrorCode.Forbidden,
    });
  const response = await execute({
    request: new Request(request.url, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "create_story",
        operationId: crypto.randomUUID(),
      }),
    }),
    origin,
    cookies,
    operation: "create",
  });
  const parsed = z
    .object({ ok: z.literal(true), data: z.object({ intentId: z.uuid() }) })
    .safeParse(await response.json());
  if (!response.ok || !parsed.success)
    return fail(intentStatus.INTENT_UNAVAILABLE, {
      code: ContinuationErrorCode.IntentUnavailable,
    });
  const resumed = await execute({
    request,
    origin,
    cookies,
    operation: "resume",
    intentId: parsed.data.data.intentId,
  });
  if (resumed.ok) {
    const target = z
      .object({ ok: z.literal(true), data: resumeTargetSchema })
      .safeParse(await resumed.json());
    if (
      target.success &&
      (target.data.data.type === "create_story" ||
        target.data.data.type === "resume_story")
    )
      redirect(continuationHttp.seeOther, targetPath(target.data.data));
  }
  redirect(
    continuationHttp.seeOther,
    authPath({ mode: "login", intentId: parsed.data.data.intentId }),
  );
};
