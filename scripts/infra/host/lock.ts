import { mkdir, rmdir } from "node:fs/promises";
import { secureDirectory } from "../artifacts";
import { readInfraConfig } from "../config";
import { privateDirectoryMode } from "../conts";
import { startupLockPollMs, startupLockTimeoutMs } from "./conts";

/** Атомарно создаёт lock-каталог; только EEXIST означает занятый lock, остальные файловые ошибки сохраняются. */
const tryAcquire = async (path: string) => {
  try {
    await mkdir(path, { mode: privateDirectoryMode });
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      return false;
    throw error;
  }
};
/** Сериализует сценарий выбранного Compose project через приватный lock-каталог. Ограниченно ждёт захват с учётом отмены и удаляет только захваченный lock в finally; stale lock автоматически не удаляет. */
export const withStartupLock = async <T>({
  signal,
  run,
}: {
  readonly signal: AbortSignal;
  readonly run: () => Promise<T>;
}) => {
  await secureDirectory(".infra");
  const path = `.infra/${readInfraConfig().project}-startup.lock`;
  const deadline = Date.now() + startupLockTimeoutMs;
  while (true) {
    signal.throwIfAborted();
    if (await tryAcquire(path)) break;
    if (Date.now() >= deadline)
      throw new Error(
        `Infrastructure startup is locked: ${path}. Check the owning command before retrying.`,
      );
    await Bun.sleep(startupLockPollMs);
  }
  try {
    signal.throwIfAborted();
    return await run();
  } finally {
    await rmdir(path);
  }
};
