import { createRequire } from "node:module";
import { z } from "zod";

const requireApp = createRequire(
  new URL("../../../../apps/fe-insta/package.json", import.meta.url),
);
const requireKit = createRequire(
  requireApp.resolve("@sveltejs/kit/package.json"),
);
const stringifyAction = z
  .object({
    stringify: z.function({ input: [z.unknown()], output: z.string() }),
  })
  .parse(requireKit("devalue")).stringify;
const payloadSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.object({ revocation: z.enum(["pending", "confirmed"]) }),
  }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) }),
]);
export const asLogoutFormReceipt = async (response: Response) => {
  const payload = payloadSchema.parse(await response.json());
  const receipt = payload.ok
    ? {
        type: "success",
        status: response.status,
        data: stringifyAction({
          success: true,
          revocation: payload.data.revocation,
        }),
      }
    : {
        type: "failure",
        status: response.status,
        data: stringifyAction({ code: payload.error.code }),
      };
  return Response.json(receipt, { headers: { "Cache-Control": "no-store" } });
};
