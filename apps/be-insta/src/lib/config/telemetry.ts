import { z } from "zod";
import { telemetryReceiverPolicy } from "./conts";

const receiverSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === telemetryReceiverPolicy.protocol &&
    telemetryReceiverPolicy.hosts.some((host) => host === url.hostname) &&
    url.pathname === telemetryReceiverPolicy.path &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
});
/** Валидирует необязательный OTLP endpoint; отсутствие отключает sink, некорректное значение останавливает конфигурацию. */
export const readOtelReceiverConfig = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  const endpoint = raw.OTEL_RECEIVER_URL;
  if (!endpoint) return undefined;
  const result = receiverSchema.safeParse(endpoint);
  if (!result.success)
    throw new Error("Invalid telemetry configuration: OTEL_RECEIVER_URL");
  return result.data;
};
