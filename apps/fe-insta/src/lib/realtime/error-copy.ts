import { codes } from "@insta/contracts/errors";
import { z } from "zod";
import type { messages } from "../i18n/index";
import { realtimeErrorKeys } from "./conts";

const publicCodeSchema = z.enum(codes.realtime);

/** Выбирает локализованный текст публичной realtime-ошибки; неизвестные внешние и диагностические коды получают безопасный общий текст. */
export const realtimeErrorCopy = ({
  code,
  copy,
}: Readonly<{
  code: string;
  copy: Readonly<Pick<(typeof messages)["en"], "errors">>;
}>) => {
  const parsed = publicCodeSchema.safeParse(code, { jitless: true });
  return parsed.success
    ? copy.errors[realtimeErrorKeys[parsed.data]]
    : copy.errors.unexpected;
};
