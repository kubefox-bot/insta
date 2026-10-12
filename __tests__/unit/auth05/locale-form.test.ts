import { expect, test } from "bun:test";
import { z } from "zod";
import { POST } from "../../../apps/fe-insta/src/routes/locale/+server";

const cookies: Parameters<typeof POST>[0]["cookies"] = {
  get: () => undefined,
  getAll: () => [],
  set: () => {},
  delete: () => {},
  parse: () => ({ name: "locale", value: "ru" }),
  serialize: () => "",
};
for (const [returnTo, expected] of [
  [
    "/conversations/owned?intentId=selected",
    "/conversations/owned?intentId=selected",
  ],
  ["https://evil.test/conversations", "/"],
  ["//evil.test/conversations", "/"],
  ["//localhost/conversations", "/"],
  ["http://[", "/"],
  ["/%2f%2fevil.test", "/"],
  [
    "/conversations?search=%D1%82%D0%B5%D1%81%D1%82",
    "/conversations?search=%D1%82%D0%B5%D1%81%D1%82",
  ],
] as const) {
  test(`native locale action returns safely from ${returnTo}`, async () => {
    const body = new FormData();
    body.set("locale", "ru");
    body.set("returnTo", returnTo);
    const result = await POST({
      request: new Request("https://localhost/locale", {
        method: "POST",
        body,
      }),
      url: new URL("https://localhost/locale"),
      cookies,
    }).catch((cause: unknown) => cause);
    const redirect = z
      .object({ status: z.literal(303), location: z.string() })
      .safeParse(result);
    expect(redirect.success).toBe(true);
    if (!redirect.success) throw new Error("Expected locale redirect");
    expect(redirect.data.location).toBe(expected);
  });
}
test("enhanced locale action saves without redirect and invalid input fails", async () => {
  const body = new FormData();
  body.set("locale", "ru");
  const result = await POST({
    request: new Request("https://localhost/locale", {
      method: "POST",
      body,
      headers: { accept: "application/json" },
    }),
    url: new URL("https://localhost/locale"),
    cookies,
  });
  expect(result.status).toBe(204);
  body.set("locale", "foreign");
  const rejected = await POST({
    request: new Request("https://localhost/locale", { method: "POST", body }),
    url: new URL("https://localhost/locale"),
    cookies,
  });
  expect(rejected.status).toBe(400);
});
