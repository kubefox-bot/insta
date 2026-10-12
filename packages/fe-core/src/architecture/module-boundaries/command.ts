import { resolve } from "node:path";
import { Result } from "@bloodyowl/boxed";
import { runModuleBoundariesCheck } from "./check.ts";
import { parseModuleBoundariesConfig } from "./config.ts";
/**
 * Читает JSON-конфиг относительно cwd и пишет диагностики в stderr; возвращает 2 при ошибке конфигурации, 1 при сбое/находках и 0 при чистой проверке.
 */
export const runModuleBoundariesCommand = async ({
  cwd,
  configPath,
}: Readonly<{ cwd: string; configPath: string }>): Promise<number> => {
  const config = (
    await Result.fromPromise(
      Promise.resolve().then(() => Bun.file(resolve(cwd, configPath)).json()),
    )
  ).flatMap((value) =>
    Result.fromExecution(() => parseModuleBoundariesConfig(value)),
  );
  if (config.isError()) {
    const error = config.getError();
    process.stderr.write(
      `insta-lints: ошибка конфигурации ${configPath}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
  const outcome = await Result.fromPromise(
    runModuleBoundariesCheck(config.get(), { cwd }),
  );
  if (outcome.isError()) {
    const error = outcome.getError();
    process.stderr.write(
      `insta-lints: ошибка module-boundaries: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
  const { findings } = outcome.get();
  for (const finding of findings)
    process.stderr.write(
      `${finding.rule}: ${finding.path}\n  ${finding.message}\n`,
    );
  return findings.length ? 1 : 0;
};
