/**
 * Проверяет равенство корню либо префикс с границей /; корень . покрывает любой путь без обращения к диску.
 */
export const isInside = (value: string, root: string): boolean =>
  root === "." || value === root || value.startsWith(`${root}/`);
/**
 * Возвращает root/<первый каталог> только для файла глубже этого каталога; непосредственные файлы root и внешние пути остаются без владельца.
 */
export const moduleOwner = (path: string, root: string): string | undefined => {
  if (!path.startsWith(`${root}/`)) return undefined;
  const [name, file] = path.slice(root.length + 1).split("/");
  return name && file ? `${root}/${name}` : undefined;
};
