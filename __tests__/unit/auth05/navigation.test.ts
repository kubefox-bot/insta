import { expect, test } from "bun:test";
import { authPath } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/index";

test("sign-in/register navigation retains only selected safe UUID and never an external destination", () => {
  const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  expect(authPath({ intentId: id, mode: "login" })).toBe(
    `/?mode=login&intentId=${id}`,
  );
  expect(authPath({ intentId: id, mode: "register" })).toBe(
    `/?mode=register&intentId=${id}`,
  );
  expect(authPath({ intentId: "https://evil.test/", mode: "register" })).toBe(
    "/?mode=register",
  );
});
