export type HookTarget = Readonly<{
  directory: string;
  previous: string | undefined;
}>;

export type GeneratedHooks = Readonly<
  Record<keyof typeof HOOK_FILENAMES, string>
>;

import type { HOOK_FILENAMES } from "./conts.ts";
