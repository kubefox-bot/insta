/**
 * A package transport can be protected before a local adapter exists.
 * Пустой local список разрешается при непустом package списке; иначе вызывается validate.
 * Содержимое package specifiers проверяет отдельный config owner.
 */
export const resolveTransportFiles = <Input>({
  files,
  packageSpecifiers,
  validate,
}: Readonly<{
  files: Input;
  packageSpecifiers: unknown;
  validate: (files: Input) => string[];
}>): string[] => {
  const packageOnly =
    Array.isArray(files) &&
    files.length === 0 &&
    Array.isArray(packageSpecifiers) &&
    packageSpecifiers.length > 0;
  return packageOnly ? [] : validate(files);
};
