import { expect, test } from "bun:test";
import { createAdmission } from "../../../src/app/http/index";

test("documentation exemption follows the application header budget before readiness or routing", async () => {
  const statuses: number[] = [];
  const bodies: unknown[] = [];
  const nextCalls: true[] = [];
  const admission = createAdmission({
    checkRequired: async () => {
      throw new Error("Oversize documentation must stop before readiness");
    },
  });
  await admission(
    { path: "/docs", headers: { "x-synthetic-oversize": "x".repeat(16384) } },
    {
      status: (status) => {
        statuses.push(status);
        return { json: (body) => bodies.push(body) };
      },
    },
    () => {
      nextCalls.push(true);
    },
  );
  expect(statuses).toEqual([431]);
  expect(bodies).toEqual([
    expect.objectContaining({
      ok: false,
      error: {
        code: "HEADERS_TOO_LARGE",
        message: "Request headers exceed limit",
      },
    }),
  ]);
  expect(nextCalls).toEqual([]);
});
