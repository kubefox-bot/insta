/**
 * Выбирает exact paths alias раньше wildcard, затем wildcard с самым длинным префиксом; подставляет захват в targets без проверки существования файлов.
 */
export const selectAliasTargets = ({
  specifier,
  paths,
}: Readonly<{
  specifier: string;
  paths: Readonly<Record<string, readonly string[]>>;
}>): readonly string[] => {
  const aliases = Object.entries(paths);
  const exact = aliases.find(([alias]) => alias === specifier);
  if (exact) return exact[1];
  const matching = aliases
    .filter(([alias]) => {
      if (!alias.includes("*")) return false;
      const [prefix, suffix = ""] = alias.split("*");
      return (
        specifier.length >= prefix.length + suffix.length &&
        specifier.startsWith(prefix) &&
        specifier.endsWith(suffix)
      );
    })
    .sort(([left], [right]) => right.indexOf("*") - left.indexOf("*"));
  const match = matching[0];
  if (!match) return [];
  const [alias, targets] = match;
  const [prefix, suffix = ""] = alias.split("*");
  const wildcard = specifier.slice(
    prefix.length,
    suffix ? -suffix.length : undefined,
  );
  return targets.map((target) => target.replace("*", wildcard));
};
