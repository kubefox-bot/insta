import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Читает только строковое name из неизвестного manifest; отсутствие/неверный тип даёт undefined.
 */
const packageName = (manifest: unknown): string | undefined => {
  if (!manifest || typeof manifest !== "object" || !("name" in manifest))
    return undefined;
  return typeof manifest.name === "string" ? manifest.name : undefined;
};
/**
 * Читает точный строковый exports[subpath]; conditional, wildcard и строковый корневой exports этой формой не раскрываются.
 */
const exportedTarget = (
  manifest: unknown,
  subpath: string,
): string | undefined => {
  if (!manifest || typeof manifest !== "object" || !("exports" in manifest))
    return undefined;
  const exports = manifest.exports;
  if (!exports || typeof exports !== "object" || !(subpath in exports))
    return undefined;
  const target: unknown = Reflect.get(exports, subpath);
  return typeof target === "string" ? target : undefined;
};

/**
 * Читает repository package.json и разрешает первый совпавший workspace package; при отсутствии строкового export пробует private path для boundary диагностики, ошибки JSON/диска пробрасывает.
 */
export const workspaceImportTargets = ({
  specifier,
  cwd,
  sourcePaths,
}: Readonly<{
  specifier: string;
  cwd: string;
  sourcePaths: ReadonlySet<string>;
}>): string[] => {
  const manifests = [...sourcePaths].filter((path) =>
    path.endsWith("/package.json"),
  );
  for (const path of manifests) {
    const manifest: unknown = JSON.parse(
      readFileSync(resolve(cwd, path), "utf8"),
    );
    const name = packageName(manifest);
    if (!name || (specifier !== name && !specifier.startsWith(`${name}/`)))
      continue;
    const subpath =
      specifier === name ? "." : `.${specifier.slice(name.length)}`;
    const target = exportedTarget(manifest, subpath);
    // Resolve private workspace paths too, so boundary rules can reject them.
    return [
      resolve(cwd, dirname(path), target ?? specifier.slice(name.length + 1)),
    ];
  }
  return [];
};
