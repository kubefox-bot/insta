import { expect, test } from "bun:test";
import { get, readonly, writable } from "svelte/store";
import { createAuthDialogOperations } from "../../src/domains/users/browser/dialog/create";
import { readAuthLinkMode } from "../../src/domains/users/browser/dialog/link";

const link = {
  href: "https://insta.test/?mode=register&intentId=selected",
  target: "",
  download: false,
};
const activation = {
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};
test("auth links retain browser navigation for modifiers, other origins, targets and downloads", () => {
  expect(
    readAuthLinkMode({
      activation,
      link,
      currentUrl: new URL("https://insta.test/conversations"),
    }),
  ).toBe("register");
  for (const changed of [
    { defaultPrevented: true },
    { button: 1 },
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
  ])
    expect(
      readAuthLinkMode({
        activation: { ...activation, ...changed },
        link,
        currentUrl: new URL("https://insta.test/"),
      }),
    ).toBeNull();
  for (const changed of [
    { target: "_self" },
    { download: true },
    { href: "https://other.test/?mode=login" },
    { href: "https://insta.test/conversations?mode=login" },
    { href: "https://insta.test/?mode=other" },
  ])
    expect(
      readAuthLinkMode({
        activation,
        link: { ...link, ...changed },
        currentUrl: new URL("https://insta.test/"),
      }),
    ).toBeNull();
  expect(
    readAuthLinkMode({
      activation,
      link: { ...link, href: "https://insta.test/?mode=login" },
      currentUrl: new URL("https://insta.test/"),
    }),
  ).toBe("login");
});

test("mode changes and dialog completion discard transferred private inputs", () => {
  const transferred = writable<string | undefined>(undefined);
  const inputTransfer = {
    view: readonly(transferred),
    clear: () => transferred.set(undefined),
  };
  const capture = () => transferred.set("private");
  const selections: Readonly<{
    mode: "login" | "register";
    intentId?: string | null;
  }>[] = [];
  const dialog = createAuthDialogOperations({
    inputTransfer,
    chooseAuthentication: (input) => {
      expect(get(inputTransfer.view)).toBeUndefined();
      selections.push(input);
    },
  });
  capture();
  dialog.chooseMode({ mode: "register", intentId: "selected" });
  expect(get(inputTransfer.view)).toBeUndefined();
  expect(selections).toEqual([{ mode: "register", intentId: "selected" }]);
  capture();
  dialog.close();
  expect(get(inputTransfer.view)).toBeUndefined();
  capture();
  dialog.authenticated();
  expect(get(inputTransfer.view)).toBeUndefined();
});
