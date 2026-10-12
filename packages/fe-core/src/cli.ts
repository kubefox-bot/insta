import { resolve } from "node:path";
import { Result } from "@bloodyowl/boxed";
import { checkApiBoundaries as runApiBoundariesCheck } from "./api-boundaries/check-api-boundaries.ts";
import { ApiBoundaryConfigError } from "./api-boundaries/config.ts";
import { parseApiBoundariesConfig } from "./api-boundaries/parse-config.ts";
import type {
  ApiBoundaryConfig,
  ApiBoundaryFinding,
} from "./api-boundaries/types.ts";
import { runModuleBoundariesCommand } from "./architecture/module-boundaries/command.ts";

import { parseArchitectureConfig } from "./architecture/parse-config.ts";
import { formatArchitectureFindings } from "./architecture/reporter.ts";
import { runArchitectureCheck } from "./architecture/run-architecture-check.ts";
import type { ArchitectureConfig } from "./architecture/types.ts";

type CliOptions = {
  configPath: string;
  strict: boolean;
};

const usage = [
  "Usage:",
  "  insta-lints architecture --config <path> [--strict]",
  "  insta-lints api-boundaries --config <path>",
  "  insta-lints module-boundaries --config <path>",
].join("\n");

/**
 * Пишет ошибку аргументов и справку в stderr; возвращает код 2 без завершения процесса.
 */
const failUsage = (message: string): number => {
  process.stderr.write(`insta-lints: ${message}\n${usage}\n`);
  return 2;
};

/**
 * Разбирает --config и разрешённый командой --strict рекурсивно; последний config побеждает, ошибки печатаются и дают код 2.
 */
const parseOptions = (
  args: readonly string[],
  allowStrict: boolean,
  options: Partial<CliOptions> = {},
): CliOptions | number => {
  const [argument, ...remaining] = args;
  if (argument === undefined) {
    return options.configPath
      ? { configPath: options.configPath, strict: options.strict ?? false }
      : failUsage("нужно передать --config <path>");
  }
  if (argument === "--strict" && allowStrict) {
    return parseOptions(remaining, allowStrict, { ...options, strict: true });
  }
  if (argument !== "--config") {
    return failUsage(`неизвестный аргумент ${argument}`);
  }

  const [configPath, ...afterConfig] = remaining;
  if (!configPath || configPath.startsWith("--")) {
    return failUsage("для --config нужен путь к JSON-файлу");
  }
  return parseOptions(afterConfig, allowStrict, { ...options, configPath });
};

/**
 * Собирает текст всех ошибок API boundary с путём, правилом и примером; выводом владеет вызывающая команда.
 */
const formatApiBoundaryFindings = (
  findings: readonly ApiBoundaryFinding[],
): string => {
  const lines = [
    "❌  API boundaries require attention",
    "  All findings are errors.",
  ];
  for (const value of findings) {
    lines.push(`  ⚠️   ${value.rule}: ${value.path}`);
    lines.push(`      ${value.message}`);
    lines.push(`      Example: ${value.example}`);
  }
  return `${lines.join("\n")}\n`;
};

/**
 * Запускает архитектурную проверку с CLI-переопределением strict, печатает находки; warn сохраняет код 0.
 */
const runArchitectureCommand = async (
  config: ArchitectureConfig,
  options: CliOptions,
  cwd: string,
): Promise<number> => {
  const result = await runArchitectureCheck(
    { ...config, mode: options.strict ? "strict" : config.mode },
    { cwd },
  );
  if (result.findings.length > 0) {
    process.stderr.write(formatArchitectureFindings(result.findings));
  }
  return result.mode === "strict" && result.findings.length > 0 ? 1 : 0;
};

/**
 * Печатает найденные нарушения API boundary и возвращает 1 при любой находке; пустой отчёт даёт 0.
 */
const runApiBoundaryCommand = async (
  config: ApiBoundaryConfig,
  cwd: string,
): Promise<number> => {
  const result = await runApiBoundariesCheck(config, { cwd });
  if (result.findings.length > 0) {
    process.stderr.write(formatApiBoundaryFindings(result.findings));
    return 1;
  }
  return 0;
};

type ParsedCommandConfig =
  | { command: "architecture"; config: ArchitectureConfig }
  | { command: "api-boundaries"; config: ApiBoundaryConfig };

/**
 * Выбирает валидатор JSON по команде и сохраняет дискриминант вместе с типизированной конфигурацией; ошибки валидации пробрасываются.
 */
const parseCommandConfig = (
  command: "architecture" | "api-boundaries",
  value: unknown,
): ParsedCommandConfig => {
  switch (command) {
    case "architecture":
      return { command, config: parseArchitectureConfig(value) };
    case "api-boundaries":
      return { command, config: parseApiBoundariesConfig(value) };
    default: {
      const unhandled: never = command;
      return unhandled;
    }
  }
};

/**
 * Передаёт проверенную конфигурацию соответствующему исполнителю; сохраняет его код завершения и отклонение Promise.
 */
const runParsedCommand = async (
  parsed: ParsedCommandConfig,
  options: CliOptions,
  cwd: string,
): Promise<number> => {
  switch (parsed.command) {
    case "architecture":
      return await runArchitectureCommand(parsed.config, options, cwd);
    case "api-boundaries":
      return await runApiBoundaryCommand(parsed.config, cwd);
    default: {
      const unhandled: never = parsed;
      return unhandled;
    }
  }
};

/**
 * Читает JSON относительно cwd и различает сбой чтения/JSON и ошибку схемы в Result, сохраняя исходную причину.
 */
const readCommandConfig = async (
  options: CliOptions,
  cwd: string,
  command: "architecture" | "api-boundaries",
): Promise<
  Result<ParsedCommandConfig, { kind: "read" | "parse"; cause: unknown }>
> =>
  (
    await Result.fromPromise(
      Promise.resolve().then(() =>
        Bun.file(resolve(cwd, options.configPath)).json(),
      ),
    )
  )
    .mapError((cause) => ({ kind: "read" as const, cause }))
    .flatMap((value) =>
      Result.fromExecution(() => parseCommandConfig(command, value)).mapError(
        (cause) => ({ kind: "parse" as const, cause }),
      ),
    );

/**
 * Преобразует сбой исполнения в stderr и код 1, а ApiBoundaryConfigError — в код 2; успешный код сохраняется.
 */
const runParsedCommandSafely = async (
  parsed: ParsedCommandConfig,
  options: CliOptions,
  cwd: string,
  command: "architecture" | "api-boundaries",
): Promise<number> => {
  const result = await Result.fromPromise(
    Promise.resolve().then(() => runParsedCommand(parsed, options, cwd)),
  );
  if (result.isOk()) return result.get();
  const error = result.getError();
  const reason = error instanceof Error ? error.message : String(error);
  if (error instanceof ApiBoundaryConfigError) {
    process.stderr.write(
      `insta-lints: не удалось прочитать конфигурацию ${options.configPath}: ${reason}\n`,
    );
    return 2;
  }
  process.stderr.write(`insta-lints: ошибка проверки ${command}: ${reason}\n`);
  return 1;
};

/**
 * Разбирает команду и конфигурацию, выполняет выбранную проверку и возвращает CLI-код; ошибки аргументов/конфига дают 2, нарушения — по политике команды.
 */
export const runCli = async (
  args: readonly string[],
  cwd = process.cwd(),
): Promise<number> => {
  const [command, ...commandArgs] = args;
  if (command === "module-boundaries") {
    const options = parseOptions(commandArgs, false);
    return typeof options === "number"
      ? options
      : runModuleBoundariesCommand({ cwd, configPath: options.configPath });
  }
  if (command !== "architecture" && command !== "api-boundaries") {
    return failUsage(
      "ожидается команда architecture, api-boundaries или module-boundaries",
    );
  }
  const options = parseOptions(commandArgs, command === "architecture");
  if (typeof options === "number") {
    return options;
  }

  const config = await readCommandConfig(options, cwd, command);
  if (config.isOk()) {
    return runParsedCommandSafely(config.get(), options, cwd, command);
  }
  const { cause, kind } = config.getError();
  const reason = cause instanceof Error ? cause.message : String(cause);
  const operation = kind === "read" ? "прочитать" : "разобрать";
  process.stderr.write(
    `insta-lints: не удалось ${operation} конфигурацию ${options.configPath}: ${reason}\n`,
  );
  return 2;
};

process.exitCode = await runCli(process.argv.slice(2));
