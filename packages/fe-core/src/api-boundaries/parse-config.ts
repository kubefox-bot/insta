import {
  readRequiredString,
  readStringArray,
} from "../lib/configuration/index.ts";
import { apiBoundaryScopedExceptionRules } from "./conts.ts";
import { resolveTransportFiles } from "./transport-configuration.ts";
import type { ApiBoundaryConfig } from "./types.ts";

/**
 * Требует непустой массив непустых строк путей и возвращает trimmed копии; существование и безопасность путей здесь не проверяет.
 */
const requiredPathArray = (value: unknown, key: string): string[] => {
  const paths = readStringArray(value, key);
  if (!paths?.length || paths.some((path) => path.trim().length === 0)) {
    throw new TypeError(`${key} должен быть непустым массивом непустых путей`);
  }
  return paths.map((path) => path.trim());
};

/**
 * Сохраняет undefined отсутствующего поля, а переданный список проверяет как непустой набор путей.
 */
const optionalPathArray = (
  value: unknown,
  key: string,
): string[] | undefined => {
  if (value === undefined) return undefined;
  return requiredPathArray(value, key);
};

/**
 * Возвращает объект с проверенным строковым массивом либо без свойства при undefined; пустой массив сохраняется.
 */
const optionalStringArrayProperty = (
  value: unknown,
  key: string,
): Record<string, string[]> => {
  const items = readStringArray(value, key);
  return items ? { [key]: items } : {};
};

/**
 * Проверяет форму exception с непустыми reason/rules и предварительно исключает glob/../; полную проверку пути выполняет нормализация конфигурации.
 */
const parseScopedException = (
  value: unknown,
): NonNullable<ApiBoundaryConfig["scopedExceptionFiles"]>[number] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      "scopedExceptionFiles содержит некорректное исключение",
    );
  }
  const exception = value as Record<string, unknown>;
  const allowedRules = readStringArray(
    exception.allowedRules,
    "scopedExceptionFiles.allowedRules",
  );
  if (
    !allowedRules?.length ||
    allowedRules.some(
      (rule) => !apiBoundaryScopedExceptionRules.includes(rule as never),
    )
  ) {
    throw new TypeError(
      "scopedExceptionFiles.allowedRules содержит неизвестное правило",
    );
  }
  const path = readRequiredString(exception.path, "scopedExceptionFiles.path");
  if (path.includes("*") || path.includes("?") || path.includes("../")) {
    throw new TypeError(
      "scopedExceptionFiles.path должен быть точным относительным путём",
    );
  }
  return {
    allowedRules: allowedRules as NonNullable<
      ApiBoundaryConfig["scopedExceptionFiles"]
    >[number]["allowedRules"],
    path,
    reason: readRequiredString(exception.reason, "scopedExceptionFiles.reason"),
  };
};

/**
 * Читает необязательные browser/package transport массивы без добавления отсутствующих свойств.
 */
const parseOptionalApiTransports = (config: Record<string, unknown>) => ({
  ...optionalStringArrayProperty(
    config.browserTransportFiles,
    "browserTransportFiles",
  ),
  ...optionalStringArrayProperty(
    config.transportPackageSpecifiers,
    "transportPackageSpecifiers",
  ),
});

/**
 * Преобразует неизвестный JSON в конфигурацию API boundaries, проверяя обязательные списки и исключения; filesystem/inclusion проверки выполняются при запуске.
 */
export const parseApiBoundariesConfig = (value: unknown): ApiBoundaryConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("конфигурация должна быть JSON-объектом");
  }
  const config = value as Record<string, unknown>;
  const clientEntryFiles = requiredPathArray(
    config.clientEntryFiles,
    "clientEntryFiles",
  );
  const transportFiles = resolveTransportFiles({
    files: config.transportFiles,
    packageSpecifiers: config.transportPackageSpecifiers,
    /**
     * Проверяет local transportFiles как непустой список trimmed путей, если resolver не принял package-only режим.
     */
    validate: (value) => requiredPathArray(value, "transportFiles"),
  });
  const serverApiRoots = readStringArray(
    config.serverApiRoots,
    "serverApiRoots",
  );
  const serverApiFiles =
    config.serverApiFiles === undefined
      ? []
      : optionalPathArray(config.serverApiFiles, "serverApiFiles");
  if (
    !serverApiRoots ||
    !serverApiFiles ||
    (serverApiRoots.length === 0 && serverApiFiles.length === 0) ||
    serverApiRoots.some((path) => path.trim().length === 0) ||
    serverApiFiles.some((path) => path.trim().length === 0)
  ) {
    throw new TypeError(
      "serverApiRoots/serverApiFiles должен содержать хотя бы один непустой путь",
    );
  }
  const serverServiceFiles = optionalPathArray(
    config.serverServiceFiles,
    "serverServiceFiles",
  );
  const values = config.scopedExceptionFiles;
  if (values !== undefined && !Array.isArray(values)) {
    throw new TypeError("scopedExceptionFiles должен быть массивом");
  }
  const scopedExceptionFiles = values?.map(parseScopedException);
  return {
    clientEntryFiles,
    ...(serverServiceFiles ? { serverServiceFiles } : {}),
    generatedRoot: readRequiredString(config.generatedRoot, "generatedRoot"),
    scopedExceptionFiles,
    ...(config.serverApiFiles === undefined ? {} : { serverApiFiles }),
    serverApiRoots: serverApiRoots.map((path) => path.trim()),
    sourceRoot: readRequiredString(config.sourceRoot, "sourceRoot"),
    transportFiles,
    ...parseOptionalApiTransports(config),
  };
};
