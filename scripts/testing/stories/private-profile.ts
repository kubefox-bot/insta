import { stat } from "node:fs/promises";
export const readPrivateStoriesProfile = async (
  path: string,
): Promise<unknown> => {
  const metadata = await stat(path);
  if ((metadata.mode & 0o077) !== 0)
    throw new Error("Stories profile must remain private (0600)");
  return Bun.file(path).json();
};
