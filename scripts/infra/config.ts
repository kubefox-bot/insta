import { z } from "zod";
import { readStoriesConfig } from "../../apps/be-insta/src/lib/config";
import { dockerEndpointSchemes } from "./conts";
import { environmentKeys, hostDefaults } from "./host/conts";
import { storiesInfra } from "./stories/conts";

const localDockerEndpoint = z
  .string()
  .refine(
    (endpoint) =>
      (endpoint.startsWith(dockerEndpointSchemes.unixSocket) &&
        endpoint.slice(dockerEndpointSchemes.unixSocket.length).length > 0) ||
      (endpoint.startsWith(dockerEndpointSchemes.windowsNamedPipe) &&
        endpoint.slice(dockerEndpointSchemes.windowsNamedPipe.length).length >
          0),
    "A local Unix socket or Windows named pipe is required",
  );

const readSelectedDockerContextEndpoint = () => {
  const result = Bun.spawnSync([
    "docker",
    "context",
    "inspect",
    "--format",
    "{{ .Endpoints.docker.Host }}",
  ]);
  const endpoint = new TextDecoder().decode(result.stdout).trim();
  if (result.exitCode !== 0 || endpoint.length === 0)
    throw new Error(
      "Could not read the selected Docker context. Start Docker Desktop or select a local Docker context.",
    );
  return endpoint;
};

/** Возвращает явный DOCKER_HOST или endpoint выбранного Docker CLI context и допускает только локальные Unix/npipe подключения. */
export const readDockerEndpoint = (
  configuration: Readonly<{ explicitEndpoint?: string }>,
  readSelectedContextEndpoint = readSelectedDockerContextEndpoint,
) => {
  const endpoint =
    configuration.explicitEndpoint ?? readSelectedContextEndpoint();
  return localDockerEndpoint.parse(endpoint);
};

/** Читает локальный Docker endpoint и проверяет имя Compose project; по умолчанию использует выбранный Docker CLI context и project insta-core. */
export const readInfraConfig = () => {
  const endpoint = readDockerEndpoint({
    explicitEndpoint: Bun.env.DOCKER_HOST,
  });
  const project = z
    .string()
    .regex(/^insta-[a-z0-9-]+$/)
    .parse(Bun.env.COMPOSE_PROJECT_NAME ?? "insta-core");
  return { endpoint, project };
};
/** Читает .env и извлекает три обязательных Mongo-пароля для bootstrap. Возвращает секреты только вызывающему владельцу подготовки; ошибка схемы не печатает значения, ошибки чтения сохраняются. */
export const readMongoBootstrap = async () => {
  const { parseEnv } = await import("node:util");
  const raw = parseEnv(await Bun.file(".env").text());
  const result = z
    .object({
      root: z.string().min(1),
      api: z.string().min(1),
      web: z.string().min(1),
    })
    .safeParse({
      root: raw.MONGO_ROOT_PASSWORD,
      api: raw.API_MONGO_PASSWORD,
      web: raw.WEB_MONGO_PASSWORD,
    });
  if (!result.success)
    throw new Error("Mongo bootstrap credentials are missing");
  return result.data;
};

/** Возвращает отдельный снимок всего окружения для дочерней команды; он может содержать секреты и не предназначен для отчёта. */
export const readCommandEnvironment = () => ({ ...Bun.env });
/** Разбивает COMPOSE_FILE заданным разделителем либо использует compose.yaml; порядок файлов сохраняется для последующего наложения конфигурации. */
export const readComposeFiles = () =>
  (Bun.env.COMPOSE_FILE ?? "compose.yaml").split(
    Bun.env.COMPOSE_PATH_SEPARATOR ?? ":",
  );
/** Копирует только разрешённые параметры окружения host-процесса; остальные настройки приложений должны поступить из подготовленного профиля. */
export const readHostAppEnvironment = () =>
  Object.fromEntries(
    [
      "PATH",
      "HOME",
      "TMPDIR",
      "TERM",
      "NO_COLOR",
      "FORCE_COLOR",
      "LOG_LEVEL",
      "NODE_ENV",
    ].flatMap((key) =>
      Bun.env[key] === undefined ? [] : [[key, Bun.env[key]]],
    ),
  );
/** Принимает только build или skip с default build; skip выбирает существующий dependency image, но его наличие эта функция не проверяет. */
export const readInfrastructureBuildMode = () => {
  const result = z
    .enum(["build", "skip"])
    .safeParse(Bun.env.INSTA_INFRA_BUILD ?? "build");
  if (!result.success)
    throw new Error(
      "INSTA_INFRA_BUILD must be build or skip (skip requires an existing dependency image)",
    );
  return result.data;
};
/** Выбирает WEB_ORIGIN либо localhost с заданным HTTPS-портом и отвергает origin с путём, другим хостом или протоколом. */
export const readComposeOrigin = (httpsPort: number) => {
  const value =
    Bun.env.WEB_ORIGIN ??
    (httpsPort === hostDefaults.httpsPort
      ? "https://localhost"
      : `https://localhost:${httpsPort}`);
  const result = z
    .url()
    .refine((origin) => {
      const url = new URL(origin);
      return (
        origin === url.origin &&
        url.protocol === "https:" &&
        url.hostname === "localhost"
      );
    })
    .safeParse(value);
  if (!result.success)
    throw new Error("WEB_ORIGIN must be a canonical HTTPS localhost origin");
  return result.data;
};

/** Валидирует Stories-настройки у infra config owner и возвращает значения для защищённого локального env-файла. */
export const readStoriesSetupConfig = (
  generatedProfile: Readonly<{
    id: string;
    endpoint: string;
    playbackEndpoint: string;
    bucket: string;
    region: string;
    prefix: string;
    accessKeyId: string;
    secretAccessKey: string;
  }>,
) => {
  const configuredAccessKey = readEnvironmentString(
    environmentKeys.storiesAccessKey,
  );
  const configuredSecretKey = readEnvironmentString(
    environmentKeys.storiesSecretKey,
  );
  const configuration = readStoriesConfig({
    [environmentKeys.storiesMode]: "enabled",
    [environmentKeys.storiesActiveProfile]:
      readEnvironmentString(environmentKeys.storiesActiveProfile) ??
      generatedProfile.id,
    [environmentKeys.storiesStorageProfiles]:
      readEnvironmentString(environmentKeys.storiesStorageProfiles) ??
      JSON.stringify([
        {
          ...generatedProfile,
          accessKeyId: configuredAccessKey ?? generatedProfile.accessKeyId,
          secretAccessKey:
            configuredSecretKey ?? generatedProfile.secretAccessKey,
        },
      ]),
    [environmentKeys.storiesMaxDurationMs]: readEnvironmentString(
      environmentKeys.storiesMaxDurationMs,
    ),
    [environmentKeys.storiesLifetimeMs]: readEnvironmentString(
      environmentKeys.storiesLifetimeMs,
    ),
  });
  if (configuration.mode !== "enabled")
    throw new Error("Enabled Stories storage profile required during setup");
  const activeProfile = configuration.profiles.find(
    (profile) => profile.id === configuration.activeProfile,
  );
  if (!activeProfile) throw new Error("Active Stories storage profile missing");
  assertLocalStoriesCredentials({
    profile: activeProfile,
    accessKey: configuredAccessKey,
    secretKey: configuredSecretKey,
  });
  return {
    environment: Object.fromEntries([
      [environmentKeys.storiesActiveProfile, configuration.activeProfile],
      [environmentKeys.storiesAccessKey, activeProfile.accessKeyId],
      [environmentKeys.storiesSecretKey, activeProfile.secretAccessKey],
      [
        environmentKeys.storiesStorageProfiles,
        JSON.stringify(configuration.profiles),
      ],
    ]),
  };
};

/** Отвергает несовпадающие сохранённые RustFS credentials, сохраняя ключи профилей внешнего S3 provider. */
const assertLocalStoriesCredentials = ({
  profile,
  accessKey,
  secretKey,
}: {
  readonly profile: {
    readonly id: string;
    readonly endpoint: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  };
  readonly accessKey: string | undefined;
  readonly secretKey: string | undefined;
}) => {
  const localProfile =
    profile.id === storiesInfra.profile &&
    profile.endpoint === storiesInfra.endpoint;
  const keysMatch =
    (accessKey === undefined || accessKey === profile.accessKeyId) &&
    (secretKey === undefined || secretKey === profile.secretAccessKey);
  if (localProfile && !keysMatch)
    throw new Error(
      "Local Stories credentials do not match the active profile",
    );
};

/** Валидирует ограниченный runtime config для stories-init, которому не нужны Mongo, Dragonfly или auth secrets. */
export const readStoriesProvisioningConfig = () =>
  readStoriesConfig({
    [environmentKeys.storiesMode]: readEnvironmentString(
      environmentKeys.storiesMode,
    ),
    [environmentKeys.storiesActiveProfile]: readEnvironmentString(
      environmentKeys.storiesActiveProfile,
    ),
    [environmentKeys.storiesStorageProfiles]: readEnvironmentString(
      environmentKeys.storiesStorageProfiles,
    ),
    [environmentKeys.storiesMaxDurationMs]: readEnvironmentString(
      environmentKeys.storiesMaxDurationMs,
    ),
    [environmentKeys.storiesLifetimeMs]: readEnvironmentString(
      environmentKeys.storiesLifetimeMs,
    ),
  });
/** Пропускает нестроковые Bun runtime flags и отдаёт значение только конфигурационному парсеру. */
const readEnvironmentString = (key: string) =>
  typeof Bun.env[key] === "string" ? Bun.env[key] : undefined;
