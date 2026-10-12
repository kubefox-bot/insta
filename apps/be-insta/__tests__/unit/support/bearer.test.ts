import { expect, test } from "bun:test";
import { readBearerToken } from "../../../src/lib/http/index";

import { createSupportHttpFixture } from "./fixture";

test("Support requires Bearer for identity and keeps missing authorization guest proof", async () => {
  const env = await createSupportHttpFixture();
  try {
    for (const [authorization, status, code] of [
      ["fixture-token", 503, "SUPPORT_IDENTITY_UNAVAILABLE"],
      ["Bearer fixture-token", 202, undefined],
      [undefined, 202, undefined],
    ] as const) {
      const response = await fetch(`${env.url}/v1/support/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authorization === undefined ? {} : { authorization }),
        },
        body: JSON.stringify({
          comment: "test",
          errorCode: "NETWORK_FAILED",
          guestContext: "support-proof",
        }),
      });
      expect(response.status).toBe(status);
      if (code)
        expect(await response.json()).toMatchObject({ error: { code } });
    }
    expect(env.stored).toHaveLength(2);
  } finally {
    await env.app.close();
  }
});

test("shared Bearer parser preserves strict scheme and rejects absent or non-string input", () => {
  for (const authorization of [
    undefined,
    null,
    1,
    [],
    "",
    "token",
    "bearer token",
    "Basic token",
    "Bearer",
  ]) {
    expect(readBearerToken({ authorization })).toBe("");
  }
  expect(readBearerToken({ authorization: "Bearer fixture-token" })).toBe(
    "fixture-token",
  );
  expect(readBearerToken({ authorization: "Bearer " })).toBe("");
});
