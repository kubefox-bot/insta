import { expect, test } from "bun:test";

test.each([
  ["Edd", "ED"],
  ["Bob", "BO"],
  ["Alice", "AL"],
  ["я", "Я"],
  [null, "?"],
  ["", "?"],
  ["e\u0301dd", "E\u0301D"],
  ["🇬🇪Bob", "🇬🇪B"],
  ["👩🏽‍💻alice", "👩🏽‍💻A"],
])("preserves whole graphemes for %s", async (username, expected) => {
  const { initials } = await import("../lib/initials");
  expect(initials(username)).toBe(expected);
});

test("identity tone survives order changes and username changes", async () => {
  const { tone } = await import("../lib/tone");
  const identities = ["user-edd", "user-bob", "user-alice", "🇬🇪", ""];
  const original = new Map(
    identities.map((identity) => [identity, tone(identity)]),
  );
  for (const identity of [...identities].reverse()) {
    expect(original.get(identity)).toBe(tone(identity));
  }
  expect(new Set(original.values()).size).toBeGreaterThan(1);
});

test("all avatar foreground/background pairs meet normal-text contrast", async () => {
  const { avatarPalette } = await import("../conts");
  const css = await Bun.file(
    new URL("../../../tokens/primitives/color.css", import.meta.url),
  ).text();
  const resolveColor = (token: string): string => {
    const name = token.match(/^var\((--[\w-]+)\)$/)?.[1];
    const hex = name
      ? css.match(new RegExp(`${name}:\\s*(#[\\da-f]{6});`, "i"))?.[1]
      : undefined;
    if (!hex) throw new Error(`Missing palette color token ${token}`);
    return hex;
  };
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return (
      (channels[0] ?? 0) * 0.2126 +
      (channels[1] ?? 0) * 0.7152 +
      (channels[2] ?? 0) * 0.0722
    );
  };
  for (const palette of Object.values(avatarPalette)) {
    const foreground = luminance(resolveColor(palette.foreground));
    const background = luminance(resolveColor(palette.background));
    expect(
      (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  }
});
