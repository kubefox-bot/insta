import { expect, test } from "bun:test";
import { readAcceptanceChromeOptions } from "../../scripts/testing/browser/config";
import { acceptanceChromeExecutableKey } from "../../scripts/testing/browser/conts";

test("default browser selection retains canonical Chrome channel without an executable override", () => {
  expect(readAcceptanceChromeOptions({})).toEqual({ channel: "chrome" });
});
test("an isolated official Chrome executable must use an explicit absolute path", () => {
  expect(
    readAcceptanceChromeOptions({
      [acceptanceChromeExecutableKey]: "/private/tmp/owned/Google Chrome",
    }),
  ).toEqual({
    channel: "chrome",
    launchOptions: { executablePath: "/private/tmp/owned/Google Chrome" },
  });
  for (const value of ["", "relative/chrome"])
    expect(() =>
      readAcceptanceChromeOptions({ [acceptanceChromeExecutableKey]: value }),
    ).toThrow("Invalid acceptance Chrome executable");
});
