import { readInfraConfig } from "./config";
import { dockerDeadlineMs } from "./conts";
/** Запускает Docker через локальный endpoint с timeout и возвращает stdout. В ошибке редактирует только redis:// адреса из stderr; это не универсальная очистка секретов, вывод не предназначен для публикации. */
export const docker = async (...args: string[]) => {
  const child = Bun.spawn(
    ["docker", "--host", readInfraConfig().endpoint, ...args],
    { stdout: "pipe", stderr: "pipe", timeout: dockerDeadlineMs },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(
      `Docker ${args[0]} failed (${code}): ${error.replace(/redis:\/\/[^\s]+/g, "[redacted]")}`,
    );
  return output.trim();
};
