import { expect, test } from "bun:test";
import { createApplication } from "../../../src/app/bootstrap";

test("native support form context rejects unavailable support without granting a proof", async () => {
  const app = await createApplication({
    checkRequired: async () => true,
    check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
    close: async () => {},
  });
  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(
      `${await app.getUrl()}/v1/support/form-context`,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "SUPPORT_UNAVAILABLE" },
    });
  } finally {
    await app.close();
  }
});
