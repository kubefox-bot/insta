import { expect, test } from "bun:test";
import {
  usernameCharacters,
  usernameInputPattern,
} from "@insta/contracts/auth";

test("RegistrationForm passes the tested username pattern to the bound input", async () => {
  const source = await Bun.file(
    new URL(
      "../../src/domains/users/components/RegistrationForm/index.svelte",
      import.meta.url,
    ),
  ).text();
  expect(source).toMatch(
    /<Input\b[^>]*name="username"[^>]*bind:value=\{username\}[^>]*pattern=\{usernameInputPattern\}/,
  );
});

test.each([
  ["ab", false],
  ["abc", true],
  ["a".repeat(32), true],
  ["a".repeat(33), false],
  ["A_1", true],
  ["ab-c", false],
  ["Вася", false],
  ["😀abc", false],
  ["abc\n", false],
  ["", false],
] as const)(
  "registration pattern validates restored username %j without length attributes",
  (username, valid) => {
    // HTML pattern requires a full-value match even for programmatic values.
    const match = new RegExp(`^(?:${usernameInputPattern})$`, "v").exec(
      username,
    );
    expect(match?.[0] === username).toBe(valid);
  },
);

test("the shared characters-only regex keeps its independent length contract", () => {
  expect(usernameCharacters.test("ab")).toBe(true);
  expect(usernameCharacters.test("a".repeat(33))).toBe(true);
  expect(usernameCharacters.test("A_1")).toBe(true);
  expect(usernameCharacters.test("ab-c")).toBe(false);
  expect(usernameCharacters.test("Вася")).toBe(false);
});
