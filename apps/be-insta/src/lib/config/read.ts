import { deriveAuthKeys } from "./auth-keys";
import { defaults } from "./conts";
import { readRealtimeConfig } from "./realtime/read";
import { serverSchema } from "./schema";
import { readStoriesConfig } from "./stories/read";
import { readOtelReceiverConfig } from "./telemetry";
/** Валидирует серверные настройки, выводит auth-ключи и собирает инфраструктурную конфигурацию без подключения клиентов. */
export const readServerConfig = ({
  raw,
}: {
  readonly raw: Readonly<Record<string, string | undefined>>;
}) => {
  const result = serverSchema.safeParse({
    realtimeOrigin: raw.REALTIME_ORIGIN,
    supportRecipient: raw.SUPPORT_RECIPIENT,
    supportSmtpHost: raw.SUPPORT_SMTP_HOST,
    supportSmtpPort: raw.SUPPORT_SMTP_PORT,
    host: raw.HOST,
    logLevel: raw.LOG_LEVEL,
    port: raw.PORT,
    apiMongoUrl: raw.API_MONGO_URL,
    dragonflyUrl: raw.DRAGONFLY_URL,
    deliveryDragonflyUrl: raw.DELIVERY_DRAGONFLY_URL,
    authSigningKey: raw.AUTH_SIGNING_KEY,
    bffSourceSigningKey: raw.BFF_SOURCE_SIGNING_KEY,
    mailpitUrl: raw.MAILPIT_URL,
    smtpHost: raw.SMTP_HOST,
    smtpPort: raw.SMTP_PORT,
  });
  if (!result.success)
    throw new Error(
      `Invalid server configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const value = result.data;
  return {
    stories: readStoriesConfig(raw),
    otelReceiver: readOtelReceiverConfig(raw),
    realtimeOrigin: value.realtimeOrigin,
    realtime: readRealtimeConfig(raw),
    host: value.host,
    observability: {
      level: value.logLevel,
      flushTimeoutMs: defaults.logFlushTimeoutMs,
    },
    port: value.port,
    mongo: {
      url: value.apiMongoUrl,
      database: defaults.database,
      timeoutMs: defaults.timeoutMs,
      poolSize: defaults.mongoPoolSize,
    },
    dragonfly: { url: value.dragonflyUrl, timeoutMs: defaults.timeoutMs },
    deliveryDragonfly: {
      url: value.deliveryDragonflyUrl,
      timeoutMs: defaults.timeoutMs,
      probeTimeoutMs: defaults.deliveryProbeTimeoutMs,
    },
    authSigningKey: value.authSigningKey,
    ...deriveAuthKeys(value.authSigningKey),
    bffSourceSigningKey: value.bffSourceSigningKey,
    mailpitUrl: value.mailpitUrl,
    smtp: { host: value.smtpHost, port: value.smtpPort },
    supportRecipient: value.supportRecipient,
    supportSmtp: { host: value.supportSmtpHost, port: value.supportSmtpPort },
    shutdownMs: defaults.shutdownMs,
  };
};
/** Читает окружение процесса на серверной границе конфигурации; потребители получают только проверенный объект. */
export const readRuntimeConfig = () => readServerConfig({ raw: Bun.env });
