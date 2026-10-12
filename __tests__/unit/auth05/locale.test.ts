import { expect, test } from "bun:test";
import { selectLocale } from "../../../apps/fe-insta/src/lib/i18n/index";

test("unsupported locale uses English fallback", () => {
  expect(selectLocale("fr")).toBe("en");
});

import {
  createI18n,
  messages,
  resolveLocale,
} from "../../../apps/fe-insta/src/lib/i18n/index";

test("cookie wins weighted Accept-Language, unsupported/zero-quality values fall back", () => {
  expect(resolveLocale({ cookie: "ru", acceptLanguage: "en" })).toBe("ru");
  expect(
    resolveLocale({
      cookie: "bad",
      acceptLanguage: "fr;q=1,ru-RU;q=0.8,en;q=0.7",
    }),
  ).toBe("ru");
  expect(resolveLocale({ acceptLanguage: "ru;q=0,en;q=0" })).toBe("en");
  expect(resolveLocale({ acceptLanguage: "ru;q=wrong" })).toBe("en");
});
test("catalog keys and ICU argument names match; interpolation preserves text", () => {
  const keys = (
    value: Readonly<Record<string, Readonly<Record<string, string>>>>,
  ) =>
    Object.entries(value)
      .flatMap(([group, entries]) =>
        Object.keys(entries).map((key) => `${group}.${key}`),
      )
      .sort();
  expect(keys(messages.en)).toEqual(keys(messages.ru));
  for (const group of Object.keys(
    messages.en,
  ) as (keyof typeof messages.en)[]) {
    for (const key of Object.keys(messages.en[group])) {
      const en =
        (messages.en[group] as Readonly<Record<string, string>>)[key] ?? "";
      const ru =
        (messages.ru[group] as Readonly<Record<string, string>>)[key] ?? "";
      expect([...en.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1])).toEqual(
        [...ru.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]),
      );
    }
  }
  const en = createI18n({
    locale: "en",
    messages: { message: "Hello {name}" },
  });
  expect(en.t("message", { name: "<img src=x>" })).toBe("Hello <img src=x>");
  expect(en.formatNumber(1234)).toBe("1,234");
});

import { deadlineDateOptions } from "../../../apps/fe-insta/src/domains/users/components/RegistrationForm/conts";

test("authentication deadline preserves epoch and visibly formats explicit UTC in both locales", () => {
  const epoch = Date.parse("2026-10-08T09:00:00.000Z");
  for (const locale of ["en", "ru"] as const) {
    const i18n = createI18n({
      locale,
      messages: { deadline: messages[locale].auth.registrationDeadline },
      dateOptions: deadlineDateOptions,
    });
    const text = i18n.t("deadline", { expiresAt: i18n.formatDate(epoch) });
    expect(text).toContain("UTC");
    expect(epoch).toBe(1791450000000);
  }
});

import { otpTemplate } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/smtp/otp-template";

test("shared i18n formatting preserves Date input and invalid-date exceptions", () => {
  const i18n = createI18n({
    locale: "ru",
    messages: {},
    dateOptions: deadlineDateOptions,
  });
  const timestamp = Date.parse("2026-10-08T09:00:00Z");
  expect(i18n.formatDate(new Date(timestamp))).toBe(i18n.formatDate(timestamp));
  expect(() => i18n.formatDate(NaN)).toThrow(RangeError);
  expect(() => i18n.formatDate(new Date(NaN))).toThrow(RangeError);
});

test("OTP email uses Russian presentation with visible UTC and preserves expiry", () => {
  const expiresAt = Date.parse("2026-10-08T09:00:00Z");
  const email = otpTemplate({
    email: "synthetic@example.test",
    messageId: "otp-presentation",
    code: "123456",
    expiresAt,
    now: expiresAt - 60000,
    errorsRemaining: 3,
  });
  expect(email.text).toContain("8 окт. 2026");
  expect(email.text).toContain("09:00:00 UTC");
  expect(email.text).toContain("1 минут и 3 ошибок");
  expect(expiresAt).toBe(1791450000000);
});
