/**
 * Приводит разделители пути к / без обращения к файловой системе.
 */
export const toPosixPath = (path: string): string => path.replaceAll("\\", "/");

/**
 * Удаляет один ведущий ./ и завершающий / после нормализации разделителей; dot-сегменты и symlink не разрешает.
 */
export const normalizePath = (path: string): string =>
  toPosixPath(path).replace(/^\.\//u, "").replace(/\/$/u, "");

/**
 * Проверяет равенство пути корню либо префикс с границей /; ожидает уже нормализованные строки.
 */
export const isInside = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

/**
 * Проверяет покрытие пути хотя бы одним защищённым корнем по целым сегментам.
 */
export const isInsideAny = (path: string, roots: readonly string[]): boolean =>
  roots.some((root) => isInside(path, root));

/**
 * Автоматически относит .svelte и +page/+layout JS/TS к browser entries; +server и *.server сюда не входят.
 */
export const isSvelteKitBrowserSource = (path: string): boolean =>
  path.endsWith(".svelte") || /(?:^|\/)\+(?:page|layout)\.[jt]s$/u.test(path);
