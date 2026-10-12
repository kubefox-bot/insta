import { z } from "zod";

const receiverSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "telemetry-receiver"].includes(url.hostname) &&
    url.pathname === "/collect" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
});
/**
 * Проверяет необязательный Faro receiver URL на серверной границе. Отсутствующий endpoint
 * отключает receiver; ошибочный вызывает конфигурационную ошибку, не молчаливое
 * отключение.
 */
export const readTelemetryConfig = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  const endpoint = raw.FARO_RECEIVER_URL;
  if (!endpoint) return { receiver: undefined };
  const parsed = receiverSchema.safeParse(endpoint);
  if (!parsed.success)
    throw new Error("Invalid telemetry configuration: FARO_RECEIVER_URL");
  return { receiver: parsed.data };
};
