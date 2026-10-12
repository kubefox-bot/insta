export const npmPublicPackagePattern =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

export const sourceExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".svelte",
] as const;
export const typedExtensions: Readonly<Record<string, string | undefined>> = {
  ".js": ".ts",
  ".jsx": ".tsx",
};
