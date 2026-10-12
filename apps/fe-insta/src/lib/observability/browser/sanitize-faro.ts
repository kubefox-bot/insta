import { z } from "zod";
import {
  faroValues,
  measurementMaximum,
  measurementNames,
} from "../client/conts";

const timestampSchema = z.iso.datetime();
const itemSchema = z.object({
  type: z.string(),
  payload: z.object({
    timestamp: timestampSchema,
    type: z.string().optional(),
    values: z.record(z.string(), z.number()).optional(),
  }),
});
/**
 * Формирует новый разрешённый payload: исключения заменяются фиксированным сообщением
 * без stack и исходного текста, измерения ограничены списком имён и диапазоном.
 * Сохраняет валидный timestamp; неизвестные типы, неверный вход и пустые измерения
 * отбрасывает.
 */
export const sanitizeFaro = (item: unknown) => {
  const parsed = itemSchema.safeParse(item, { jitless: true });
  if (!parsed.success) return undefined;
  const { type, payload } = parsed.data;
  const meta = { app: { name: faroValues.appName } };
  if (type === "exception")
    return {
      meta,
      exceptions: [
        {
          type: faroValues.errorType,
          value: faroValues.unhandledError,
          timestamp: payload.timestamp,
        },
      ],
    };
  if (type !== "measurement") return undefined;
  const measurementType =
    payload.type === faroValues.webVitals
      ? faroValues.webVitals
      : measurementNames.find((name) => name === payload.type);
  if (!measurementType) return undefined;
  const values = Object.fromEntries(
    Object.entries(payload.values ?? {}).filter(
      ([name, value]) =>
        measurementNames.some((allowed) => allowed === name) &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= measurementMaximum,
    ),
  );
  if (!Object.keys(values).length) return undefined;
  return {
    meta,
    measurements: [
      { type: measurementType, values, timestamp: payload.timestamp },
    ],
  };
};
