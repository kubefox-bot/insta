import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import {
  readStoriesConfig,
  readStoriesMode,
} from "../../../apps/be-insta/src/lib/config";
import { readComposeOrigin } from "../config";
import { storiesInfra } from "../stories/conts";
import { withLocalPlaybackOrigin } from "../stories/playback";
import {
  environmentKeys,
  hostDefaults,
  localFrontendMarker,
  localRealtimeOrigin,
  loopbackHost,
  maxPort,
  startupStoriesOverrideKeys,
  storiesModeValues,
} from "./conts";

const port = z.coerce.number().int().positive().max(maxPort);
const storiesModeSchema = z.enum(storiesModeValues);
const settingsSchema = z.object({
  mongoPort: port.default(hostDefaults.mongoPort),
  brokerPort: port.default(hostDefaults.brokerPort),
  deliveryBrokerPort: port.default(hostDefaults.deliveryBrokerPort),
  smtpPort: port.default(hostDefaults.smtpPort),
  mailpitPort: port.default(hostDefaults.mailpitPort),
  frontendPort: port.default(hostDefaults.frontendPort),
  backendPort: port.default(hostDefaults.backendPort),
  httpPort: port.default(hostDefaults.httpPort),
  httpsPort: port.default(hostDefaults.httpsPort),
});
const privateCredentialsSchema = z.object({
  [environmentKeys.mongoRootPassword]: z.string().min(1),
  [environmentKeys.apiMongoPassword]: z.string().min(1),
  [environmentKeys.webMongoPassword]: z.string().min(1),
  [environmentKeys.brokerPassword]: z.string().min(1),
  [environmentKeys.deliveryBrokerPassword]: z.string().min(1),
  [environmentKeys.authSigningKey]: z.string().regex(/^[a-fA-F0-9]{64}$/),
  [environmentKeys.sessionEncryptionKey]: z.string().regex(/^[a-fA-F0-9]{64}$/),
  [environmentKeys.bffSourceSigningKey]: z.string().regex(/^[a-fA-F0-9]{64}$/),
});
/** Валидирует Stories private profile и переводит только его internal RustFS endpoint в доступный host-loopback address. */
const deriveHostStoriesEnvironment = (
  raw: Readonly<Record<string, string>>,
  playbackOrigin: string,
) => {
  const configured = readStoriesConfig(raw);
  if (configured.mode === "disabled")
    return { [environmentKeys.storiesMode]: configured.mode };
  const stories = readStoriesConfig({
    ...raw,
    [environmentKeys.storiesStorageProfiles]: JSON.stringify(
      withLocalPlaybackOrigin(configured.profiles, playbackOrigin).map(
        (profile) => ({
          ...profile,
          endpoint:
            profile.id === storiesInfra.profile &&
            profile.endpoint === storiesInfra.endpoint
              ? `http://127.0.0.1:${hostDefaults.storiesPort}`
              : profile.endpoint,
        }),
      ),
    ),
  });
  if (stories.mode !== "enabled") throw new Error("Stories profile required");
  return {
    [environmentKeys.storiesMode]: stories.mode,
    [environmentKeys.storiesActiveProfile]: stories.activeProfile,
    [environmentKeys.storiesStorageProfiles]: JSON.stringify(stories.profiles),
    [environmentKeys.storiesMaxDurationMs]: String(
      stories.policy.maxDurationMs,
    ),
    [environmentKeys.storiesLifetimeMs]: String(stories.policy.lifetimeMs),
  };
};
/** Преобразует заданные host-порты либо defaults и требует их попарного различия; неверное значение отклоняется общей ошибкой без вывода окружения. */
export const validateHostSettings = (
  raw: Readonly<Record<string, string | undefined>>,
) => {
  const result = settingsSchema.safeParse({
    mongoPort: raw.HOST_MONGO_PORT,
    brokerPort: raw.HOST_DRAGONFLY_PORT,
    deliveryBrokerPort: raw.HOST_DELIVERY_DRAGONFLY_PORT,
    smtpPort: raw.HOST_SMTP_PORT,
    mailpitPort: raw.MAILPIT_PORT,
    frontendPort: raw.FE_PORT,
    backendPort: raw.BE_PORT,
    httpPort: raw.HTTP_PORT,
    httpsPort: raw.HTTPS_PORT,
  });
  if (!result.success) throw new Error("Invalid host development settings");
  const ports = [
    ...Object.values(result.data),
    ...(readStoriesMode(raw) === "enabled" ? [hostDefaults.storiesPort] : []),
  ];
  if (new Set(ports).size !== ports.length)
    throw new Error("Host development ports must be distinct");
  return result.data;
};
/** Читает текущий Bun.env через единую проверку host-портов; возвращает новый валидированный набор настроек. */
export const readHostSettings = () => validateHostSettings(Bun.env);
/** Читает Stories mode через backend-конфигурационный владелец; отсутствие явно означает enabled. */
export const readHostStoriesMode = () => readStoriesMode(Bun.env);

/** Проверяет целочисленный порт Vite из переданного окружения либо Bun.env; отсутствие использует локальный default. */
export const readLocalVitePort = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  const result = port.safeParse(
    raw[environmentKeys.vitePort] ?? hostDefaults.vitePort,
  );
  if (!result.success) throw new Error("Invalid local Vite port");
  return result.data;
};

/** Проверяет отдельный целочисленный HMR-порт из окружения либо default; взаимное различие с Vite проверяет сценарий запуска. */
export const readLocalViteHMRPort = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  const result = port.safeParse(
    raw[environmentKeys.viteHMRPort] ?? hostDefaults.viteHMRPort,
  );
  if (!result.success) throw new Error("Invalid local Vite HMR port");
  return result.data;
};

/** Принимает единственную строку Docker inspect с точным ключом STORIES_MODE и разрешённым значением; лишние строки или неверный режим отклоняет. */
export const validateLocalFrontendStoriesMode = (raw: string) => {
  const output = raw.trimEnd();
  const prefix = `${environmentKeys.storiesMode}=`;
  const [line, ...extraLines] = output.split("\n");
  if (!line?.startsWith(prefix) || extraLines.length > 0)
    throw new Error("Invalid Docker backend Stories mode");
  const result = storiesModeSchema.safeParse(line.slice(prefix.length));
  if (!result.success) throw new Error("Invalid Docker backend Stories mode");
  return result.data;
};

/** Из валидированных host-настроек и проверенных приватных credentials создаёт отдельные BE/FE окружения с loopback-провайдерами. Stories включены при валидном private profile; явный disabled сохраняет Core-only запуск. Исходный объект не изменяется. */
export const deriveHostEnvironment = ({
  settings,
  credentials,
}: {
  readonly settings: z.infer<typeof settingsSchema>;
  readonly credentials: unknown;
}) => {
  const raw = z.record(z.string(), z.string()).parse(credentials);
  const result = privateCredentialsSchema.safeParse(raw);
  if (!result.success) throw new Error("Invalid private host credentials");
  const secrets = result.data;
  const origin = readComposeOrigin(settings.httpsPort);
  const storiesEnvironment = deriveHostStoriesEnvironment(raw, origin);
  /** Строит URL конкретной host-базы с percent-encoded паролем, replicaSet и directConnection; результат содержит credentials. */
  const mongoUrl = (database: string, password: string) =>
    `mongodb://${database}:${encodeURIComponent(password)}@${loopbackHost}:${settings.mongoPort}/${database}?authSource=${database}&replicaSet=rs0&directConnection=true`;
  const brokerUrl = `redis://:${encodeURIComponent(secrets.DRAGONFLY_PASSWORD)}@${loopbackHost}:${settings.brokerPort}`;
  return {
    backend: {
      [environmentKeys.host]: loopbackHost,
      [environmentKeys.port]: String(settings.backendPort),
      [environmentKeys.apiMongoUrl]: mongoUrl(
        "insta_api",
        secrets.API_MONGO_PASSWORD,
      ),
      [environmentKeys.brokerUrl]: brokerUrl,
      [environmentKeys.deliveryBrokerUrl]: `redis://:${encodeURIComponent(secrets.DELIVERY_DRAGONFLY_PASSWORD)}@${loopbackHost}:${settings.deliveryBrokerPort}`,
      [environmentKeys.authSigningKey]: secrets.AUTH_SIGNING_KEY,
      [environmentKeys.bffSourceSigningKey]: secrets.BFF_SOURCE_SIGNING_KEY,
      [environmentKeys.realtimeOrigin]: origin,
      [environmentKeys.smtpHost]: loopbackHost,
      [environmentKeys.smtpPort]: String(settings.smtpPort),
      [environmentKeys.supportSmtpHost]: loopbackHost,
      [environmentKeys.supportSmtpPort]: String(settings.smtpPort),
      [environmentKeys.mailpitUrl]: `http://${loopbackHost}:${settings.mailpitPort}`,
      ...storiesEnvironment,
    },
    frontend: {
      [environmentKeys.host]: loopbackHost,
      [environmentKeys.port]: String(settings.frontendPort),
      [environmentKeys.webMongoUrl]: mongoUrl(
        "insta_web",
        secrets.WEB_MONGO_PASSWORD,
      ),
      [environmentKeys.brokerUrl]: brokerUrl,
      [environmentKeys.sessionEncryptionKey]: secrets.SESSION_ENCRYPTION_KEY,
      [environmentKeys.bffSourceSigningKey]: secrets.BFF_SOURCE_SIGNING_KEY,
      [environmentKeys.apiBaseUrl]: `http://${loopbackHost}:${settings.backendPort}`,
      [environmentKeys.origin]: origin,
      [environmentKeys.devOrigin]: origin,
      [environmentKeys.trustedWebProxyHost]: loopbackHost,
      [environmentKeys.storiesMode]:
        storiesEnvironment[environmentKeys.storiesMode],
    },
  };
};
/** Читает .env без следования конечному symlink, требуя обычный файл текущего пользователя без group/other прав. Парсит credentials и закрывает handle в finally; содержимое не журналирует. */
const readPrivateCredentials = async () => {
  const file = await open(".env", constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0
    )
      throw new Error(
        "Private .env must be an owned regular file with mode0600",
      );
    return parseEnv(await file.readFile("utf8"));
  } finally {
    await file.close();
  }
};

/** Загружает приватный .env через защищённый reader и преобразует его в окружения host-приложений; ошибки чтения и проверки не скрываются. */
export const readHostEnvironment = async (
  settings: z.infer<typeof settingsSchema>,
) =>
  deriveHostEnvironment({
    settings,
    credentials: await readPrivateCredentials(),
  });

/** Выбирает один Stories mode для host-приложений и Compose после подготовки .env; у локального RustFS обновляет только публичный playback origin. */
export const deriveStartupEnvironment = ({
  settings,
  credentials,
  storiesMode,
  overrides = {},
}: {
  readonly settings: z.infer<typeof settingsSchema>;
  readonly credentials: unknown;
  readonly storiesMode: z.infer<typeof storiesModeSchema>;
  readonly overrides?: Readonly<Record<string, string | undefined>>;
}) => {
  const saved = z.record(z.string(), z.string()).parse(credentials);
  const selected = {
    ...saved,
    ...Object.fromEntries(
      startupStoriesOverrideKeys.flatMap((key) =>
        overrides[key] === undefined ? [] : [[key, overrides[key]]],
      ),
    ),
    [environmentKeys.storiesMode]: storiesMode,
  };
  const applications = deriveHostEnvironment({
    settings,
    credentials: selected,
  });
  const stories = readStoriesConfig(selected);
  const compose = {
    [environmentKeys.storiesMode]: storiesMode,
    ...(stories.mode === "enabled"
      ? {
          [environmentKeys.storiesActiveProfile]: stories.activeProfile,
          [environmentKeys.storiesStorageProfiles]: JSON.stringify(
            withLocalPlaybackOrigin(
              stories.profiles,
              readComposeOrigin(settings.httpsPort),
            ),
          ),
          [environmentKeys.storiesMaxDurationMs]: String(
            stories.policy.maxDurationMs,
          ),
          [environmentKeys.storiesLifetimeMs]: String(
            stories.policy.lifetimeMs,
          ),
        }
      : {}),
  };
  return { applications, compose };
};

/** Читает защищённый .env один раз и возвращает согласованные настройки выбранного режима для приложений и Compose. */
export const readStartupEnvironment = async (
  settings: z.infer<typeof settingsSchema>,
  storiesMode: z.infer<typeof storiesModeSchema>,
) =>
  deriveStartupEnvironment({
    settings,
    credentials: await readPrivateCredentials(),
    storiesMode,
    overrides: Bun.env,
  });

/** На основе host credentials формирует FE-окружение для прямого HTTPS Vite, отдельного HMR и существующего Docker backend. Переносит проверенный Stories mode backend, сохраняя его realtime origin. */
export const deriveLocalFrontendEnvironment = ({
  settings,
  credentials,
  vitePort,
  viteHMRPort,
  storiesMode,
}: {
  readonly settings: z.infer<typeof settingsSchema>;
  readonly credentials: unknown;
  readonly vitePort: number;
  readonly viteHMRPort: number;
  readonly storiesMode: z.infer<typeof storiesModeSchema>;
}) => {
  const environment = deriveHostEnvironment({ settings, credentials });
  const origin = `https://localhost:${vitePort}`;
  return {
    ...environment.frontend,
    [environmentKeys.origin]: origin,
    [environmentKeys.devOrigin]: origin,
    [localFrontendMarker]: "1",
    [environmentKeys.localHMRPort]: String(viteHMRPort),
    [localRealtimeOrigin]: environment.backend[environmentKeys.realtimeOrigin],
    [environmentKeys.storiesMode]: storiesMode,
  };
};

/** Соединяет защищённое чтение credentials с построением окружения локального frontend; возвращаемые секреты принадлежат запускающему сценарию. */
export const readLocalFrontendEnvironment = async (
  settings: z.infer<typeof settingsSchema>,
  vitePort: number,
  viteHMRPort: number,
  storiesMode: z.infer<typeof storiesModeSchema>,
) => {
  return deriveLocalFrontendEnvironment({
    settings,
    credentials: await readPrivateCredentials(),
    vitePort,
    viteHMRPort,
    storiesMode,
  });
};

/** Проецирует host-порты и путь proxy в Compose environment; fingerprint строится из упорядоченного набора портов для проверки совместимости запуска. */
export const deriveHostComposeEnvironment = ({
  settings,
  proxyConfig,
}: {
  readonly settings: z.infer<typeof settingsSchema>;
  readonly proxyConfig: string;
}) => {
  const fingerprint = Object.values(settings).join("-");
  return {
    fingerprint,
    environment: {
      [environmentKeys.hostMongoPort]: String(settings.mongoPort),
      [environmentKeys.hostBrokerPort]: String(settings.brokerPort),
      [environmentKeys.hostDeliveryBrokerPort]: String(
        settings.deliveryBrokerPort,
      ),
      [environmentKeys.hostSmtpPort]: String(settings.smtpPort),
      [environmentKeys.mailpitPort]: String(settings.mailpitPort),
      [environmentKeys.httpPort]: String(settings.httpPort),
      [environmentKeys.httpsPort]: String(settings.httpsPort),
      [environmentKeys.fingerprint]: fingerprint,
      [environmentKeys.proxyConfig]: proxyConfig,
      [environmentKeys.proxyStaticConfig]: resolve("infra/traefik/static.yml"),
    },
  };
};
