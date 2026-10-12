import type { AvatarTone } from "./types";

export const initialsLength = 2;
export const neutralInitials = "?";
export const identityHashMultiplier = 31;
export const avatarTones = [
  "terracotta",
  "paper",
  "stone",
  "beige",
  "brown",
] as const satisfies readonly AvatarTone[];
export const avatarPalette = {
  terracotta: {
    foreground: "var(--color-neutral-0)",
    background: "var(--color-terrakota-700)",
  },
  paper: {
    foreground: "var(--color-neutral-0)",
    background: "var(--color-additional-old-paper)",
  },
  stone: {
    foreground: "var(--color-neutral-0)",
    background: "var(--color-neutral-800)",
  },
  beige: {
    foreground: "var(--color-neutral-0)",
    background: "var(--color-additional-light-beige)",
  },
  brown: {
    foreground: "var(--color-neutral-1000)",
    background: "var(--color-additional-brown)",
  },
} as const satisfies Record<
  AvatarTone,
  Readonly<{ foreground: string; background: string }>
>;
