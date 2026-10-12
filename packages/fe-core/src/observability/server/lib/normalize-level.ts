import { z } from "zod";
import { nativeLevelNames, nativeLevels } from "../conts";

const nativeLevel = z
  .enum(nativeLevelNames)
  .transform((level) => nativeLevels[level])
  .catch("info");
/** Сопоставляет native уровень Pino разрешённому уровню; неизвестный ввод использует info. */
export const normalizeNativeLevel = (level: unknown) =>
  nativeLevel.parse(level);
