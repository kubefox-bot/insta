export type PasswordHasher = Readonly<{
  hash: (input: Readonly<{ password: string }>) => Promise<string>;
  verify: (
    input: Readonly<{ password: string; hash?: string | undefined }>,
  ) => Promise<boolean>;
}>;
