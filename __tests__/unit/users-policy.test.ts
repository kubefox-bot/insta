import { expect, test } from "bun:test";
import {
  emailKey,
  usernameKey,
  validPassword,
  validUsername,
} from "../../apps/be-insta/src/domains/users/domain/policy";

test("username has exact ASCII boundaries and case-insensitive identity", () => {
  for (const value of ["ab", "a".repeat(33), "Вася", "ab-c", "abc\n", "😀abc"])
    expect(validUsername(value)).toBe(false);
  for (const value of ["abc", "a".repeat(32), "A_1"])
    expect(validUsername(value)).toBe(true);
  expect(usernameKey("Alice_1")).toBe(usernameKey("ALICE_1"));
  expect(emailKey("  Alice@Example.TEST \n")).toBe("alice@example.test");
});
test("password limits count scalar code points, preserve spaces/paste and reject malformed Unicode", () => {
  for (const value of [
    "a".repeat(11),
    "a".repeat(129),
    "😀".repeat(11),
    "😀".repeat(129),
    `${"a".repeat(12)}\ud800`,
  ])
    expect(validPassword(value)).toBe(false);
  for (const value of [
    "a".repeat(12),
    "a".repeat(128),
    "😀".repeat(12),
    "😀".repeat(128),
    " a pasted password \n",
    " ".repeat(12),
  ])
    expect(validPassword(value)).toBe(true);
});
test("username rejects every final line terminator", () => {
  for (const suffix of ["\n", "\r", "\r\n", "\u2028", "\u2029"])
    expect(validUsername(`abc${suffix}`)).toBe(false);
});
