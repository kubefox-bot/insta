import { expect, test } from "bun:test";
import { requestLimits } from "@insta/contracts/http";
import { withContext } from "@insta/fe-core/observability/server";
import { createAdmission } from "../../apps/be-insta/src/app/http/index";
import { readCorrelation } from "../../apps/be-insta/src/lib/http/correlation";

test("original header budget accepts N and rejects N+1 without adding a correlation header", async () => {
  const requestId = crypto.randomUUID();
  const admit = createAdmission({
    checkRequired: async () => true,
  });
  const headerPrefix = "x-fixture: \r\n";
  for (const [bytes, allowed] of [
    [requestLimits.headerBytes, true],
    [requestLimits.headerBytes + 1, false],
  ] as const) {
    const headers = {
      "x-fixture": "x".repeat(bytes - Buffer.byteLength(headerPrefix)),
    };
    const effects: unknown[] = [];
    await withContext({
      context: { requestId },
      execute: () =>
        admit(
          { path: "/probe", headers },
          {
            status: (status) => ({
              json: (body) => {
                effects.push({ status, body });
              },
            }),
          },
          () => {
            effects.push("allowed");
          },
        ),
    });
    expect(Object.keys(headers)).toEqual(["x-fixture"]);
    if (allowed) expect(effects).toEqual(["allowed"]);
    else
      expect(effects).toEqual([
        expect.objectContaining({
          status: 431,
          body: expect.objectContaining({ meta: { requestId } }),
        }),
      ]);
  }
});

test("outside ALS a validated explicit attempt header remains stable across reads", () => {
  const headers = { "x-request-id": crypto.randomUUID() };
  expect(readCorrelation(headers)).toEqual(readCorrelation(headers));
});
