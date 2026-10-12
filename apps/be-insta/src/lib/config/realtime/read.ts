import { realtimeEnvironmentKeys } from "./conts";
import { realtimeConfigSchema } from "./schema";
import type { RealtimeConfig } from "./types";

/** Разбирает политику доставки на границе конфигурации, не раскрывая исходные значения при ошибке. */
export const readRealtimeConfig = (
  raw: Readonly<Record<string, string | undefined>>,
): RealtimeConfig => {
  const settings = Object.fromEntries(
    Object.entries(realtimeEnvironmentKeys).map(([name, key]) => [
      name,
      raw[key],
    ]),
  );
  const result = realtimeConfigSchema.safeParse(settings);
  if (!result.success) throw new Error("Invalid realtime configuration");
  return result.data;
};
