import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { privateDirectoryMode, privateFileMode } from "./conts";

/** Создаёт приватный каталог, отвергает symlink на конечном пути и чужого владельца, затем выставляет private mode. Закрывает directory handle независимо от исхода. */
export const secureDirectory = async (path: string) => {
  await mkdir(path, { recursive: true, mode: privateDirectoryMode });
  const directory = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await directory.stat();
    if (stat.uid !== process.getuid?.())
      throw new Error("Runtime directory has another owner");
    await directory.chmod(privateDirectoryMode);
  } finally {
    await directory.close();
  }
};
/** Открывает принадлежащий пользователю обычный файл без следования конечному symlink и выставляет private mode. Сохраняет существующее содержимое по умолчанию; replace явно обрезает и перезаписывает его. Handle закрывается в finally. */
export const writePrivateFile = async ({
  path,
  content,
  mode = "preserve",
}: {
  readonly path: string;
  readonly content: string;
  readonly mode?: "preserve" | "replace";
}) => {
  const acquired = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    privateFileMode,
  )
    .then((handle) => ({ handle, created: true }))
    .catch(async (error: unknown) => {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EEXIST"
      )
        throw error;
      return {
        handle: await open(path, constants.O_WRONLY | constants.O_NOFOLLOW),
        created: false,
      };
    });
  try {
    const stat = await acquired.handle.stat();
    if (!stat.isFile() || stat.uid !== process.getuid?.())
      throw new Error("Runtime file is not owned regular data");
    await acquired.handle.chmod(privateFileMode);
    if (acquired.created || mode === "replace") {
      await acquired.handle.truncate();
      await acquired.handle.writeFile(content);
    }
  } finally {
    await acquired.handle.close();
  }
};
