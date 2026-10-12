import { readinessTiming } from "@insta/contracts/http";
import {
  defaultApiTimeoutMs,
  defaultMongoPoolSize,
  logFlushTimeoutMs,
  webDatabaseName,
} from "../conts";
import { deriveWebKeys } from "./keys";
import { apiSchema, loggingSchema, serverSchema } from "./schema";
import { readStoriesAvailability } from "./stories";
/**
 * Проверяет REST base URL, timeout и предел размера ответа общей схемой. При ошибке
 * выдаёт безопасную конфигурационную ошибку без сырых значений.
 */
export const validateApiConfiguration = (input: unknown) => {
  const result = apiSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid API configuration");
  return result.data;
};
/**
 * Читает REST-настройки из серверного окружения и применяет общую валидацию/defaults.
 * Возвращаемые значения предназначены серверному transport, не browser bundle.
 */
export const readApiConfiguration = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) =>
  validateApiConfiguration({
    baseURL: raw.API_BASE_URL,
    timeoutMs: raw.API_TIMEOUT_MS,
    maxResponseBytes: raw.API_MAX_RESPONSE_BYTES,
  });
/**
 * Проверяет секреты и инфраструктурные настройки BFF, затем согласует API timeout с
 * readiness budget. Возвращает серверные зависимости и производные ключи; ошибки называют
 * поля, не их значения.
 */
export const readServerConfig = ({
  raw,
}: {
  readonly raw: Readonly<Record<string, string | undefined>>;
}) => {
  const result = serverSchema.safeParse({
    logLevel: raw.LOG_LEVEL,
    webMongoUrl: raw.WEB_MONGO_URL,
    sessionEncryptionKey: raw.SESSION_ENCRYPTION_KEY,
    bffSourceSigningKey: raw.BFF_SOURCE_SIGNING_KEY,
    trustedWebProxyHost: raw.TRUSTED_WEB_PROXY_HOST,
  });
  if (!result.success)
    throw new Error(
      `Invalid web configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const api = readApiConfiguration(raw);
  if (api.timeoutMs < readinessTiming.minimumBffApiTimeoutMs)
    throw new Error(
      "Invalid server configuration: API_TIMEOUT_MS below readiness budget",
    );
  return {
    api,
    storiesAvailable: readStoriesAvailability(raw),
    observability: {
      level: result.data.logLevel,
      flushTimeoutMs: logFlushTimeoutMs,
    },
    mongo: {
      url: result.data.webMongoUrl,
      database: webDatabaseName,
      poolSize: defaultMongoPoolSize,
      timeoutMs: defaultApiTimeoutMs,
    },
    sessionEncryptionKey: result.data.sessionEncryptionKey,
    bffSourceSigningKey: result.data.bffSourceSigningKey,
    ...deriveWebKeys(result.data.sessionEncryptionKey),
    trustedWebProxyHost: result.data.trustedWebProxyHost,
  };
};
/**
 * Снимает валидированный серверный конфигурационный snapshot из Bun.env при обращении
 * composition root.
 */
export const readRuntimeConfig = () => readServerConfig({ raw: Bun.env });

/**
 * Независимо валидирует LOG_LEVEL для раннего запуска логирования и добавляет
 * фиксированный flush budget. Не требует доступности остальных зависимостей BFF.
 */
export const readLoggingConfig = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  const result = loggingSchema.safeParse({ logLevel: raw.LOG_LEVEL });
  if (!result.success)
    throw new Error("Invalid logging configuration: LOG_LEVEL");
  return { level: result.data.logLevel, flushTimeoutMs: logFlushTimeoutMs };
};
