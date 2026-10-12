import { expect, test } from "bun:test";
import * as setup from "../../scripts/testing/environment/delivery";

test("prepared acceptance rejects degraded delivery even when HTTP is200", () => {
  expect(typeof setup.validateDeliveryAcceptance).toBe("function");
  setup.validateDeliveryAcceptance({ status: "ok", delivery: "ok" });
  expect(() =>
    setup.validateDeliveryAcceptance({ status: "ok", delivery: "degraded" }),
  ).toThrow();
  expect(() => setup.validateDeliveryAcceptance({ status: "ok" })).toThrow();
});
