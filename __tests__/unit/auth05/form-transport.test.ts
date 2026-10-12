import { expect, test } from "bun:test";
import { z } from "zod";
import { authFormAction } from "../../../apps/fe-insta/src/domains/users/server/forms";
import { loginMutationRequestSchema } from "../../../apps/fe-insta/src/lib/api/generated/schemas/loginSchema";

for (const step of ["login", "start", "complete"] as const) {
  test(`enhanced ${step} form uses its strict transport payload`, async () => {
    const bodies: unknown[] = [];
    const valuesByStep = {
      login: {
        email: "synthetic@example.test",
        password: "synthetic-password-123",
      },
      start: { email: "synthetic@example.test" },
      complete: { username: "Synthetic", password: "synthetic-password-123" },
    } as const;
    const values = valuesByStep[step];
    const body = new FormData();
    body.set("step", step);
    for (const [name, value] of Object.entries(values)) body.set(name, value);
    const login = async ({ request }: Readonly<{ request: Request }>) => {
      const input = await request.json();
      bodies.push(input);
      return loginMutationRequestSchema.safeParse(input).success
        ? Response.json({ ok: true, data: {} })
        : Response.json(
            { ok: false, error: { code: "VALIDATION_FAILED" } },
            { status: 400 },
          );
    };
    const registration = async ({
      request,
    }: Readonly<{ request: Request }>) => {
      bodies.push(await request.json());
      return Response.json({
        ok: true,
        data: { stage: step === "complete" ? "login" : "code" },
      });
    };
    const event = {
      request: new Request("https://localhost/?mode=register", {
        method: "POST",
        body,
        headers: { "x-sveltekit-action": "true" },
      }),
      url: new URL("https://localhost/?mode=register"),
      cookies: {
        get: () => undefined,
        getAll: () => [],
        set: () => {},
        delete: () => {},
        parse: () => {
          throw new Error("Unexpected cookie parse");
        },
        serialize: () => "",
      },
    } satisfies Parameters<typeof authFormAction>[0];
    const dependencies = {
      login,
      registration,
      session: async () => new Response(null, { status: 503 }),
    };
    const result = await authFormAction(event, dependencies);
    expect(result).toMatchObject({ success: true });
    if (step === "complete") expect(result).toMatchObject({ stage: "login" });
    expect(bodies).toEqual([step === "login" ? values : { step, ...values }]);
    if (step === "complete") {
      const native = await authFormAction(
        {
          ...event,
          request: new Request("https://localhost/?mode=register", {
            method: "POST",
            body,
          }),
        },
        dependencies,
      ).catch((cause: unknown) => cause);
      const redirect = z
        .object({ status: z.literal(303), location: z.string() })
        .parse(native);
      expect(redirect.location).toBe("/?mode=login");
    }
  });
}
