import { describe, expect, test } from "bun:test";
import { formatRelativeDateTime } from "../index";

const format = (
  timestamp: string,
  now: string,
  locale = "ru",
  timeZone = "Asia/Tbilisi",
) =>
  formatRelativeDateTime({
    timestampMs: Date.parse(timestamp),
    nowMs: Date.parse(now),
    locale,
    timeZone,
  });

describe("relative calendar date and time", () => {
  test("localizes today and preserves a 24-hour time", () => {
    expect(format("2026-10-11T10:30:00Z", "2026-10-11T15:00:00Z")).toBe(
      "сегодня, 14:30",
    );
    expect(format("2026-10-11T10:30:00Z", "2026-10-11T15:00:00Z", "en")).toBe(
      "today, 14:30",
    );
  });
  test("one minute across local midnight is yesterday", () => {
    expect(format("2026-10-10T19:59:00Z", "2026-10-10T20:00:00Z")).toBe(
      "вчера, 23:59",
    );
  });
  test("older dates follow the requested locale", () => {
    expect(format("2026-10-09T10:30:00Z", "2026-10-11T15:00:00Z")).toBe(
      "09.10.2026, 14:30",
    );
    expect(format("2026-10-09T10:30:00Z", "2026-10-11T15:00:00Z", "en")).toBe(
      "10/09/2026, 14:30",
    );
  });
  test("calendar dates cross year and leap day boundaries", () => {
    expect(format("2025-12-31T10:30:00Z", "2026-01-01T15:00:00Z", "en")).toBe(
      "yesterday, 14:30",
    );
    expect(format("2024-02-29T10:30:00Z", "2024-03-01T15:00:00Z", "en")).toBe(
      "yesterday, 14:30",
    );
  });
  test("a 25-hour DST day remains today and 24 elapsed hours can be yesterday", () => {
    expect(
      format(
        "2026-11-01T04:30:00Z",
        "2026-11-02T04:45:00Z",
        "en",
        "America/New_York",
      ),
    ).toBe("today, 00:30");
    expect(
      format(
        "2026-11-01T03:30:00Z",
        "2026-11-02T04:45:00Z",
        "en",
        "America/New_York",
      ),
    ).toBe("yesterday, 23:30");
  });
  test("spring DST classifies calendar dates instead of elapsed hours", () => {
    expect(
      format(
        "2026-03-07T05:30:00Z",
        "2026-03-09T03:45:00Z",
        "en",
        "America/New_York",
      ),
    ).toBe("yesterday, 00:30");
    expect(
      format(
        "2026-03-08T04:59:00Z",
        "2026-03-09T04:00:00Z",
        "en",
        "America/New_York",
      ),
    ).toBe("03/07/2026, 23:59");
  });
  test("future calendar dates use an absolute date", () => {
    expect(format("2026-10-12T10:30:00Z", "2026-10-11T15:00:00Z")).toBe(
      "12.10.2026, 14:30",
    );
  });
  test("invalid timestamp or reference time returns null", () => {
    for (const timestampMs of [Number.NaN, Number.POSITIVE_INFINITY, 9e15]) {
      expect(
        formatRelativeDateTime({
          timestampMs,
          nowMs: 0,
          locale: "en",
          timeZone: "UTC",
        }),
      ).toBeNull();
      expect(
        formatRelativeDateTime({
          timestampMs: 0,
          nowMs: timestampMs,
          locale: "en",
          timeZone: "UTC",
        }),
      ).toBeNull();
    }
    expect(
      formatRelativeDateTime({
        timestampMs: 0,
        nowMs: 0,
        locale: "en",
        timeZone: "UTC",
      }),
    ).toBe("today, 00:00");
  });
  test("invalid timezone remains an explicit configuration error", () => {
    expect(() =>
      format(
        "2026-10-11T10:30:00Z",
        "2026-10-11T15:00:00Z",
        "en",
        "invalid/zone",
      ),
    ).toThrow(RangeError);
  });
});
