import { z } from "zod";
import { authPagePath } from "./conts";
/**
 * Строит внутренний путь login/register, добавляя intentId только после проверки UUID и
 * кодируя query через URLSearchParams.
 */
export const authPath = ({
  intentId,
  mode,
}: Readonly<{ intentId?: string | null; mode: "login" | "register" }>) => {
  const query = new URLSearchParams();
  query.set("mode", mode);
  if (z.uuid().safeParse(intentId).success && intentId)
    query.set("intentId", intentId);
  const suffix = query.toString();
  return suffix ? `${authPagePath}?${suffix}` : authPagePath;
};
