import { expect, test } from "bun:test";
import { formatDateTime, formatTime } from "../index";

const timestampMs = Date.parse("2026-10-11T10:30:00Z");
test("explicit zones select UTC and Tbilisi clocks in both locales", () => {
  for (const locale of ["ru", "en"]) {
    expect(formatTime({ timestampMs, locale, timeZone: "UTC" })).toBe("10:30");
    expect(formatTime({ timestampMs, locale, timeZone: "Asia/Tbilisi" })).toBe(
      "14:30",
    );
  }
});
test("invalid instants return null while invalid Intl settings throw", () => {
  for (const timestampMs of [NaN, Infinity, 8.64e15 + 1]) {
    expect(
      formatTime({ timestampMs, locale: "en", timeZone: "UTC" }),
    ).toBeNull();
    expect(
      formatDateTime({ timestampMs, locale: "en", timeZone: "UTC" }),
    ).toBeNull();
  }
  expect(() =>
    formatTime({ timestampMs, locale: "bad_locale", timeZone: "UTC" }),
  ).toThrow(RangeError);
  expect(() =>
    formatDateTime({ timestampMs, locale: "en", timeZone: "Invalid/Zone" }),
  ).toThrow(RangeError);
});
test("date presentation keeps explicit UTC visible and prevents an options zone override", () => {
  const options = {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "Asia/Tbilisi",
  } as const;
  const text = formatDateTime({
    timestampMs,
    locale: "ru",
    timeZone: "UTC",
    options,
  });
  expect(text).toContain("10:30:00");
  expect(text).toContain("UTC");
});
