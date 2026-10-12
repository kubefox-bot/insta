import { httpClientCatalog } from "./conts.ts";
import type { HttpClientDefinition } from "./types.ts";

const definitions = new Map<string, HttpClientDefinition>(
  httpClientCatalog.map(([specifier, definition]) => [
    specifier,
    {
      directCallable: definition.directCallable,
      methods: new Set<string>(definition.methods),
    },
  ]),
);

/**
 * Возвращает заимствованное описание точного specifier из HTTP-каталога; неизвестный пакет не классифицируется.
 */
export const definitionForHttpClient = (
  specifier: string,
): HttpClientDefinition | undefined => definitions.get(specifier);

/**
 * Считает default экспорт запросной функцией только у directCallable клиента из каталога.
 */
export const isDefaultHttpClientExport = (
  definition: HttpClientDefinition,
  exportedName: string,
): boolean => exportedName === "default" && definition.directCallable;

/**
 * Проверяет точное имя экспортируемого request-метода по каталогу клиента, без анализа реализации пакета.
 */
export const hasHttpClientMethod = (
  definition: HttpClientDefinition,
  exportedName: string,
): boolean => definition.methods.has(exportedName);

/**
 * Объединяет callable default и известные request-методы; служебные exports клиента не считаются HTTP-вызовами.
 */
export const isHttpClientRequestExport = (
  definition: HttpClientDefinition,
  exportedName: string,
): boolean =>
  isDefaultHttpClientExport(definition, exportedName) ||
  hasHttpClientMethod(definition, exportedName);
