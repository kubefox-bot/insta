import { resolve } from "node:path";
import { npmPublicPackagePattern } from "./conts.ts";

/**
 * Отличает alias на корень обычного npm-пакета в cwd/node_modules от локального alias; subpath и неканоническое написание не признаются.
 */
export const isCanonicalPackageAlias = ({
  specifier,
  target,
  cwd,
}: Readonly<{ specifier: string; target: string; cwd: string }>): boolean =>
  npmPublicPackagePattern.test(specifier) &&
  target === resolve(cwd, "node_modules", specifier);
