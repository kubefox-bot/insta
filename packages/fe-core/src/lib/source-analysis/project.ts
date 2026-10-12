import { resolve } from "node:path";
import type * as ts from "typescript/unstable/ast";
import { API, type Project } from "typescript/unstable/async";
import { readSvelteScripts } from "./svelte-script.ts";
import { createSymbolResolver, parentScriptScopes } from "./symbols.ts";

type Source = Readonly<{ absolutePath: string; sourceText: string }>;

/**
 * Читает AST виртуальных скриптов данного исходника из открытого проекта; отсутствие ожидаемого скрипта — ошибка, неизвестный исходник даёт пустой список.
 */
const readScriptSources = async ({
  absolutePath,
  project,
  scripts,
}: Readonly<{
  absolutePath: string;
  project: Project;
  scripts: ReadonlyMap<string, ReadonlyMap<string, string>>;
}>): Promise<readonly ts.SourceFile[]> => {
  const files: ts.SourceFile[] = [];
  for (const path of scripts.get(absolutePath)?.keys() ?? []) {
    const source = await project.program.getSourceFile(path);
    if (!source)
      throw new Error(`Не удалось прочитать ${absolutePath}: ${path}`);
    files.push(source);
  }
  return files;
};

/**
 * Virtual scripts never touch consumer files, and retain independent scopes.
 * Создаёт виртуальный TS project поверх consumer tsconfig; реальные файлы не записывает.
 * При ошибке открытия закрывает API, при успехе обязанность api.close передаёт вызывающему.
 */
export const createSourceProject = async (
  cwd: string,
  sources: readonly Source[],
  compilerOptions: Readonly<Record<string, unknown>> = {},
) => {
  Bun.JSONC.parse(await Bun.file(resolve(cwd, "tsconfig.json")).text());
  const scripts = new Map(
    sources.map((source) => [
      source.absolutePath,
      source.absolutePath.endsWith(".svelte")
        ? readSvelteScripts(source.sourceText, source.absolutePath)
        : new Map([[source.absolutePath, source.sourceText]]),
    ]),
  );
  const virtualFiles = new Map(
    [...scripts.values()].flatMap((script) => [...script]),
  );
  const configPath = resolve(cwd, ".insta-lints.virtual.tsconfig.json");
  virtualFiles.set(
    configPath,
    JSON.stringify({
      extends: resolve(cwd, "tsconfig.json"),
      compilerOptions,
      files: [...virtualFiles.keys()],
      include: [],
    }),
  );
  const api = new API({
    cwd,
    fs: {
      /**
       * Сообщает наличие виртуального файла; undefined оставляет проверку остальных путей файловой системе TypeScript.
       */
      fileExists: (path) => (virtualFiles.has(path) ? true : undefined),
      /**
       * Возвращает текст только виртуальных файлов; undefined оставляет чтение остальных путей стандартной файловой системе.
       */
      readFile: (path) => virtualFiles.get(path),
    },
  });
  try {
    const snapshot = await api.updateSnapshot({
      openProjects: [configPath],
      openFiles: [...virtualFiles.keys()].filter((path) => path !== configPath),
    });
    const project = snapshot.getProject(configPath);
    if (!project)
      throw new Error("Не удалось открыть изолированный source project.");
    return {
      api,
      project,
      symbolAtLocation: createSymbolResolver({
        project,
        parentScopes: parentScriptScopes(scripts.values()),
      }),
      /**
       * Возвращает AST скриптов исходника из принадлежащего этому API проекта; ресурс остаётся открытым до api.close у владельца.
       */
      sourceFiles: (absolutePath: string) =>
        readScriptSources({ absolutePath, project, scripts }),
    };
  } catch (error) {
    await api.close();
    throw error;
  }
};
