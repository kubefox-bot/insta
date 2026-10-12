import { lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { validateBrowserTransports } from "./browser-configuration";
import { ApiBoundaryConfigError } from "./configuration-error";
import { apiBoundaryScopedExceptionRules } from "./conts.ts";
import { resolveTransportFiles } from "./transport-configuration.ts";
import type { ApiBoundaryConfig } from "./types.ts";

export { ApiBoundaryConfigError } from "./configuration-error";

const sourceFileExtension = /\.(?:[cm]?[jt]sx?|svelte)$/u;

/**
 * Отбирает JS/TS варианты расширений и Svelte для boundary scan; поддерживаемый синтаксис этим фильтром не доказывается.
 */
export const isApiBoundarySourcePath = (path: string): boolean =>
  sourceFileExtension.test(path);

/**
 * Бросает ApiBoundaryConfigError с именем поля, чтобы CLI отличал неверную конфигурацию от нарушения исходников.
 */
const fail = (key: string, detail: string): never => {
  throw new ApiBoundaryConfigError(`${key}: ${detail}`);
};

/**
 * Проверяет строгое вложение пути в каталог с разделителем /; сам корень не считается вложенным файлом.
 */
const isInside = (path: string, root: string): boolean =>
  path.startsWith(`${root}/`);

/**
 * Обрезает пробелы, нормализует разделители/dot-сегменты и запрещает абсолютный, glob, .. и корневой . путь; ошибки маркируются ключом конфигурации.
 */
const normalizeConfigPath = (value: string, key: string): string => {
  const path =
    typeof value === "string" ? value.trim().replaceAll("\\", "/") : "";
  if (
    !path ||
    posix.isAbsolute(path) ||
    /^[a-z]:/iu.test(path) ||
    /[*?]/u.test(path) ||
    path.split("/").includes("..")
  ) {
    return fail(
      key,
      "нужен точный относительный путь внутри cwd без .. или glob",
    );
  }
  const normalized = posix.normalize(path).replace(/\/$/u, "");
  if (normalized === ".")
    return fail(key, "нужен путь к подкаталогу или файлу внутри cwd");
  return normalized;
};

/**
 * Определяет conventional tests по __tests__ или .test/.spec JS/TS суффиксам для исключения из production графа.
 */
export const isTestSourcePath = (path: string): boolean =>
  path.split("/").includes("__tests__") ||
  /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/u.test(path);

// Inspect existing ancestors too: an absent future directory must not hide an
// external or aliased symlink, or a regular file used as a parent directory.
/**
 * Ищет существующий путь или, если разрешено, ближайшего предка и отклоняет symlink в его realpath; отсутствие обязательного пути — ошибка.
 */
const existingFilesystemPath = (
  absolute: string,
  key: string,
  allowMissing: boolean,
): string => {
  let existing = absolute;
  while (!lstatSync(existing, { throwIfNoEntry: false })) {
    if (!allowMissing) fail(key, `путь ${absolute} не существует`);
    existing = dirname(existing);
  }
  if (realpathSync(existing) !== existing) {
    fail(key, `путь ${absolute} не должен проходить через symlink`);
  }
  return existing;
};

/**
 * Проверяет тип файла/каталога и отсутствие symlink, включая предков ещё не созданного каталога; системные ошибки оборачивает в ApiBoundaryConfigError.
 */
const validateFilesystemPath = (
  cwd: string,
  path: string,
  key: string,
  {
    kind,
    allowMissing = false,
  }: { kind: "directory" | "file"; allowMissing?: boolean },
): void => {
  const absolute = resolve(cwd, path);
  try {
    const existing = existingFilesystemPath(absolute, key, allowMissing);
    const stat = statSync(existing);
    if (existing !== absolute || kind === "directory") {
      if (!stat.isDirectory()) fail(key, `${path} должен быть каталогом`);
    } else if (!stat.isFile() || !isApiBoundarySourcePath(path)) {
      fail(
        key,
        `${path} должен быть существующим JavaScript или TypeScript исходным файлом`,
      );
    }
  } catch (error) {
    if (error instanceof ApiBoundaryConfigError) throw error;
    fail(key, `не удалось проверить путь ${path}: ${String(error)}`);
  }
};

type ConfigPathValidators = {
  filePath: (value: string, key: string) => string;
  nestedPath: (value: string, key: string) => string;
  optionalProtectedRoots: (values: unknown, key: string) => string[];
  protectedRoot: (value: string, key: string) => string;
  requiredFiles: (values: readonly string[], key: string) => string[];
};

/**
 * Создаёт валидаторы, привязанные к cwd/sourceRoot, для точных production файлов и защищённых каталогов; сами файлы не изменяет.
 */
const createConfigPathValidators = (
  cwd: string,
  sourceRoot: string,
): ConfigPathValidators => {
  /**
   * Нормализует точный путь и требует строгого вложения в sourceRoot; существование оставляет специализированному валидатору.
   */
  const nestedPath = (value: string, key: string): string => {
    const path = normalizeConfigPath(value, key);
    if (!isInside(path, sourceRoot)) {
      return fail(
        key,
        `путь должен находиться внутри sourceRoot (${sourceRoot})`,
      );
    }
    return path;
  };
  /**
   * Проверяет защищённый каталог внутри sourceRoot; разрешает будущий каталог только при допустимых существующих предках.
   */
  const protectedRoot = (value: string, key: string): string => {
    const path = nestedPath(value, key);
    validateFilesystemPath(cwd, path, key, {
      kind: "directory",
      allowMissing: true,
    });
    return path;
  };
  /**
   * Требует существующий production исходник внутри sourceRoot без symlink; conventional test path отклоняет.
   */
  const filePath = (value: string, key: string): string => {
    const path = nestedPath(value, key);
    if (isTestSourcePath(path)) {
      return fail(key, `${path} не может быть test source file`);
    }
    validateFilesystemPath(cwd, path, key, { kind: "file" });
    return path;
  };
  /**
   * Требует непустой массив и проверяет каждый элемент как точный production file; возвращает нормализованные пути.
   */
  const requiredFiles = (values: readonly string[], key: string): string[] => {
    if (!Array.isArray(values) || values.length === 0) {
      return fail(key, "нужен непустой массив исходных файлов");
    }
    return values.map((path) => filePath(path, key));
  };
  /**
   * Проверяет массив защищённых каталогов, допуская пустой список; ошибки отдельного элемента включают индекс поля.
   */
  const optionalProtectedRoots = (values: unknown, key: string): string[] => {
    if (!Array.isArray(values)) {
      return fail(key, "нужен массив защищённых каталогов");
    }
    return values.map((value, index) => {
      if (typeof value !== "string") {
        return fail(`${key}[${index}]`, "нужен непустой путь к каталогу");
      }
      return protectedRoot(value, `${key}[${index}]`);
    });
  };

  return {
    filePath,
    nestedPath,
    optionalProtectedRoots,
    protectedRoot,
    requiredFiles,
  };
};

/**
 * Нормализует точные exception-файлы и требует непустое reason с поддерживаемыми allowedRules; отсутствие списка сохраняется.
 */
const normalizeScopedExceptionFiles = (
  values: ApiBoundaryConfig["scopedExceptionFiles"],
  filePath: ConfigPathValidators["filePath"],
) =>
  values?.map((exception) => {
    const key = "scopedExceptionFiles";
    const path = filePath(exception.path, key);
    if (
      typeof exception.reason !== "string" ||
      !exception.reason.trim() ||
      !Array.isArray(exception.allowedRules) ||
      exception.allowedRules.length === 0 ||
      exception.allowedRules.some(
        (rule) => !apiBoundaryScopedExceptionRules.includes(rule),
      )
    ) {
      return fail(key, "нужны непустой reason и допустимый allowedRules");
    }
    return { ...exception, path };
  });

/**
 * Принимает точные package entrypoints без glob, пробелов, завершающего / и ..; отсутствие списка даёт [], resolution пакета не выполняется.
 */
const normalizeTransportPackageSpecifiers = (
  values: ApiBoundaryConfig["transportPackageSpecifiers"],
): string[] => {
  if (values === undefined) return [];
  if (!Array.isArray(values))
    return fail(
      "transportPackageSpecifiers",
      "нужен массив package entrypoints",
    );
  return values.map((value, index) => {
    if (
      typeof value !== "string" ||
      !/^(?:@[^/\s]+\/)?[^./\s][^\s]*$/u.test(value) ||
      value.endsWith("/") ||
      value.split("/").includes("..") ||
      value.includes("*")
    ) {
      return fail(
        `transportPackageSpecifiers[${index}]`,
        "нужен точный package entrypoint без glob",
      );
    }
    return value;
  });
};

/**
 * Собирает проверенные local/package/browser transports, позволяя package-only конфигурацию через общий resolver.
 */
const normalizeTransportConfiguration = ({
  config,
  requiredFiles,
}: Readonly<{
  config: ApiBoundaryConfig;
  requiredFiles: ConfigPathValidators["requiredFiles"];
}>) => {
  const transportPackageSpecifiers = normalizeTransportPackageSpecifiers(
    config.transportPackageSpecifiers,
  );
  const transportFiles = resolveTransportFiles({
    files: config.transportFiles,
    packageSpecifiers: config.transportPackageSpecifiers,
    /**
     * Проверяет local transportFiles как непустой набор существующих production файлов, когда resolver не выбрал package-only режим.
     */
    validate: (value) => requiredFiles(value, "transportFiles"),
  });
  const browserTransportFiles = config.browserTransportFiles
    ? requiredFiles(config.browserTransportFiles, "browserTransportFiles")
    : [];
  return { transportFiles, transportPackageSpecifiers, browserTransportFiles };
};

/**
 * Требует принадлежность service-файлов server boundary и запрещает совпадение с raw transport; нарушение бросает config error.
 */
const validateServerServices = ({
  files,
  serverFiles,
  serverRoots,
  transports,
}: Readonly<{
  files: readonly string[];
  serverFiles: readonly string[];
  serverRoots: readonly string[];
  transports: readonly string[];
}>) => {
  for (const path of files) {
    if (
      !serverFiles.includes(path) &&
      !serverRoots.some((root) => isInside(path, root))
    ) {
      fail(
        "serverServiceFiles",
        `${path} должен принадлежать server API boundary`,
      );
    }
    if (transports.includes(path)) {
      fail("serverServiceFiles", `${path} не может быть raw transport`);
    }
  }
};

/**
 * Проверяет пути на диске, владельцев transport/service/browser и наличие server boundary, возвращая новый нормализованный config; никакие исходники не записывает.
 */
export const normalizeApiBoundaryConfig = (
  config: ApiBoundaryConfig,
  cwd: string,
): ApiBoundaryConfig => {
  const sourceRoot = normalizeConfigPath(config.sourceRoot, "sourceRoot");
  validateFilesystemPath(cwd, sourceRoot, "sourceRoot", { kind: "directory" });
  const validators = createConfigPathValidators(cwd, sourceRoot);
  const { filePath, optionalProtectedRoots, protectedRoot, requiredFiles } =
    validators;
  const scopedExceptionFiles = normalizeScopedExceptionFiles(
    config.scopedExceptionFiles,
    filePath,
  );
  const serverApiRoots = optionalProtectedRoots(
    config.serverApiRoots,
    "serverApiRoots",
  );
  const serverApiFiles = config.serverApiFiles
    ? requiredFiles(config.serverApiFiles, "serverApiFiles")
    : [];

  if (serverApiRoots.length === 0 && serverApiFiles.length === 0) {
    fail("serverApiRoots", "нужен хотя бы один защищённый каталог или файл");
  }

  const serverServiceFiles = config.serverServiceFiles
    ? requiredFiles(config.serverServiceFiles, "serverServiceFiles")
    : [];
  const { transportPackageSpecifiers, transportFiles, browserTransportFiles } =
    normalizeTransportConfiguration({ config, requiredFiles });
  const generatedRoot = protectedRoot(config.generatedRoot, "generatedRoot");
  validateBrowserTransports({
    paths: browserTransportFiles,
    serverFiles: serverApiFiles,
    serverRoots: serverApiRoots,
    generatedRoot,
    serverTransports: transportFiles,
  });
  validateServerServices({
    files: serverServiceFiles,
    serverFiles: serverApiFiles,
    serverRoots: serverApiRoots,
    transports: transportFiles,
  });

  return {
    sourceRoot,
    serverApiFiles,
    serverServiceFiles,
    serverApiRoots,
    generatedRoot,
    browserTransportFiles,
    transportFiles,
    transportPackageSpecifiers,
    clientEntryFiles: requiredFiles(
      config.clientEntryFiles,
      "clientEntryFiles",
    ),
    scopedExceptionFiles,
  };
};

/**
 * Требует участия каждого настроенного точного файла в Git-backed scan, включая исключения и transports; отсутствующий файл даёт ошибку конфигурации.
 */
export const validateScannedConfigFiles = (
  config: ApiBoundaryConfig,
  sourcePaths: ReadonlySet<string>,
): void => {
  const entries = [
    ...(config.serverApiFiles ?? []).map(
      (path) => ["serverApiFiles", path] as const,
    ),
    ...(config.serverServiceFiles ?? []).map(
      (path) => ["serverServiceFiles", path] as const,
    ),
    ...config.transportFiles.map((path) => ["transportFiles", path] as const),
    ...(config.browserTransportFiles ?? []).map(
      (path) => ["browserTransportFiles", path] as const,
    ),
    ...config.clientEntryFiles.map(
      (path) => ["clientEntryFiles", path] as const,
    ),
    ...(config.scopedExceptionFiles ?? []).map(
      ({ path }) => ["scopedExceptionFiles", path] as const,
    ),
  ];
  for (const [key, path] of entries) {
    if (!sourcePaths.has(path))
      fail(
        key,
        `${path} исключён из git-backed scan; файл должен участвовать в проверке`,
      );
  }
};
