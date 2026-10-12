import { storyWireLimits } from "@insta/contracts/stories";
import { z } from "zod";
import { storyModeValues, storyRuntimeDefaults } from "./conts";
import { storiesSchema } from "./schema";

/** Валидирует внешний Stories mode с enabled default, не разбирая provider-настройки. */
export const readStoriesMode = (
  raw: Readonly<Record<string, string | undefined>>,
) => {
  const result = z
    .enum(storyModeValues)
    .safeParse(raw.STORIES_MODE ?? "enabled");
  if (!result.success) throw new Error("Invalid Stories mode");
  return result.data;
};
/** Разбирает Stories policy и storage profiles только для enabled-режима; ошибки возвращаются без значений секретов. */
export const readStoriesConfig = (
  raw: Readonly<Record<string, string | undefined>>,
) => {
  try {
    const mode = readStoriesMode(raw);
    return storiesSchema.parse(
      mode === "enabled"
        ? {
            mode,
            policy: {
              maxDurationMs:
                raw.STORIES_MAX_DURATION_MS === undefined
                  ? storyRuntimeDefaults.maxDurationMs
                  : Number(raw.STORIES_MAX_DURATION_MS),
              lifetimeMs:
                raw.STORIES_LIFETIME_MS === undefined
                  ? storyRuntimeDefaults.lifetimeMs
                  : Number(raw.STORIES_LIFETIME_MS),
              maxFileBytes: storyWireLimits.maxFileBytes,
              captureSafetyMarginMs: storyWireLimits.captureSafetyMarginMs,
            },
            activeProfile: raw.STORIES_ACTIVE_PROFILE,
            profiles: JSON.parse(raw.STORIES_STORAGE_PROFILES ?? "null"),
          }
        : { mode },
    );
  } catch (error) {
    return invalidConfiguration(error);
  }
};

/** Скрывает содержимое ошибки Stories-конфигурации, сохраняя только имя её класса в cause. */
const invalidConfiguration = (error: unknown): never => {
  throw new Error("Invalid Stories configuration", {
    cause: error instanceof Error ? error.name : "unknown",
  });
};
