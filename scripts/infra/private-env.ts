import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { parseEnv } from "node:util";
// Configuration preparation owns this update; existing values are never replaced.
/** Дописывает только отсутствующие настройки в принадлежащий пользователю обычный env-файл без следования symlink; существующие значения сохраняет. */
export const ensureEnvironmentValues = async ({
  path,
  values,
}: Readonly<{ path: string; values: Readonly<Record<string, string>> }>) => {
  const file = await open(path, constants.O_RDWR | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid?.())
      throw new Error("Configuration must be an owned regular file");
    const text = await file.readFile("utf8");
    const existing = parseEnv(text);
    const missing = Object.entries(values).filter(
      ([key]) => existing[key] === undefined,
    );
    if (!missing.length) return;
    await file.write(
      `${text.endsWith("\n") ? "" : "\n"}${missing.map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
      stat.size,
    );
  } finally {
    await file.close();
  }
};
