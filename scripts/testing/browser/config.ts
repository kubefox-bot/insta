import { isAbsolute } from "node:path";
import { z } from "zod";
import { acceptanceChromeExecutableKey } from "./conts";

/** Разрешает private executable официального Chrome для acceptance без установки системного приложения; default channel остаётся прежним. */
export const readAcceptanceChromeOptions = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  const value = raw[acceptanceChromeExecutableKey];
  if (value === undefined) return { channel: "chrome" } as const;
  const parsed = z.string().min(1).refine(isAbsolute).safeParse(value);
  if (!parsed.success) throw new Error("Invalid acceptance Chrome executable");
  return {
    channel: "chrome",
    launchOptions: { executablePath: parsed.data },
  } as const;
};
