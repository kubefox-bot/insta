import { CommonErrorCode } from "@insta/contracts/errors";
import type { RequestEvent } from "@sveltejs/kit";
import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { loginMutationRequestSchema } from "../../../lib/api/generated/schemas/loginSchema";
import type { RequestContext } from "../../../lib/api/server/index";
import { authPath } from "../../auth-continuation/server/index";
import { authSeeOtherStatus, authStatus, formErrorFields } from "./conts";
import { logoutFormRequest } from "./transport/logout-form";
import type { AuthRequest } from "./types";

const formSchema = z
  .object({
    step: z.enum(["login", "start", "resend", "verify", "complete", "logout"]),
  })
  .passthrough();
const resultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z
      .object({
        stage: z.string().optional(),
        revocation: z.enum(["pending", "confirmed"]).optional(),
      })
      .passthrough(),
  }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) }),
]);
type AuthFormDependencies = Readonly<{
  login: (input: AuthRequest) => Promise<Response>;
  registration: (input: AuthRequest) => Promise<Response>;
  session: (input: AuthRequest) => Promise<Response>;
  context?: RequestContext;
}>;

/**
 * Адаптирует HTML form к JSON auth-операциям и SvelteKit action-результату; для обычной формы
 * с login_required перенаправляет на вход с сохранением intentId.
 */
export const authFormAction = async (
  { request, url, cookies }: Pick<RequestEvent, "request" | "url" | "cookies">,
  { login, registration, session, context }: AuthFormDependencies,
) => {
  const parsed = formSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );
  if (!parsed.success)
    return fail(authStatus.VALIDATION_FAILED, {
      code: CommonErrorCode.ValidationFailed,
    });
  const { step, ...values } = parsed.data;
  if (step === "login" && !loginMutationRequestSchema.safeParse(values).success)
    return fail(authStatus.VALIDATION_FAILED, {
      code: CommonErrorCode.ValidationFailed,
      field: "email",
    });
  const internalRequest = new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url.origin },
    body: JSON.stringify(step === "login" ? values : { step, ...values }),
  });
  const input = { request: internalRequest, origin: url.origin, cookies };
  const handlers = {
    login,
    /**
     * Передаёт logout формы через проверку ожидаемого поколения сессии.
     */
    logout: (input: AuthRequest) =>
      logoutFormRequest(input, { auth: { session }, context }),
    start: registration,
    resend: registration,
    verify: registration,
    complete: registration,
  };
  const response = await handlers[step](input);
  const result = resultSchema.parse(await response.json());
  if (
    result.ok &&
    result.data.stage === "login" &&
    request.headers.get("x-sveltekit-action") !== "true"
  )
    redirect(
      authSeeOtherStatus,
      authPath({
        mode: "login",
        intentId: new URL(request.url).searchParams.get("intentId"),
      }),
    );
  return result.ok
    ? {
        success: true,
        stage: result.data.stage,
        revocation: result.data.revocation,
      }
    : fail(response.status, {
        code: result.error.code,
        field: formErrorFields[step],
      });
};
