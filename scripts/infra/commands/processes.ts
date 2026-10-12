import { type ChildProcess, spawn } from "node:child_process";
import { shutdownTimeoutMs } from "../host/conts";
import {
  processGroupKillSettlementMs,
  processGroupSignalRetryTimeoutMs,
} from "./conts";
import { signalOwnedGroup } from "./group-signal";
import { OwnedProcessGroup } from "./process-group";
import type { ProcessInput } from "./types";

const ownedProcessesShutdownTimeoutMs =
  shutdownTimeoutMs +
  processGroupSignalRetryTimeoutMs +
  processGroupKillSettlementMs;

/** Ждёт все settlements либо timeout, сохраняя отдельные fulfilled/rejected результаты; очищает собственный таймер. Timeout не отменяет переданные операции. */
export const settleOwnedProcesses = async (
  settlements: readonly Promise<unknown>[],
  timeoutMs: number,
) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    Promise.allSettled(settlements).then((results) => ({
      kind: "settled" as const,
      results,
    })),
    new Promise<{ readonly kind: "timed-out" }>((resolve) => {
      timeout = setTimeout(() => resolve({ kind: "timed-out" }), timeoutMs);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  return outcome;
};

export class OwnedProcesses {
  readonly #signal: AbortSignal;
  readonly #children = new Map<ChildProcess, Promise<number>>();
  readonly #groups = new Map<OwnedProcessGroup, Promise<void>>();
  readonly #cleanups: (() => Promise<void>)[] = [];
  /** Запрашивает остановку всех зарегистрированных групп; не сигнализирует произвольным процессам хоста. */
  readonly #abort = () => {
    for (const group of this.#groups.keys()) group.stop();
  };
  /** Привязывает владельца дочерних процессов к переданному AbortSignal; снятие listener и завершение ресурсов выполняет close. */
  constructor(signal: AbortSignal) {
    this.#signal = signal;
    signal.addEventListener("abort", this.#abort);
  }
  /** Регистрирует асинхронный cleanup до отмены; исполнение откладывает до close. */
  onClose(cleanup: () => Promise<void>) {
    this.#signal.throwIfAborted();
    this.#cleanups.push(cleanup);
  }
  /** Запускает отдельную detached cleanup-команду даже при отменённом основном сценарии. Ограничивает ожидание, при timeout убивает группу и закрывает stdout pipe; возвращает код/вывод либо агрегирует ошибки остановки. */
  async runCleanup(input: ProcessInput, timeoutMs = shutdownTimeoutMs) {
    const [executable, ...args] = input.args;
    if (!executable) throw new Error("Cleanup executable is required");
    const child = spawn(executable, args, {
      cwd: input.cwd,
      env: input.env,
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const output: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => output.push(chunk));
    const exit = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
    const outcome = await settleOwnedProcesses([exit], timeoutMs);
    if (outcome.kind === "settled") {
      this.#assertSettled(outcome.results);
      return {
        code: await exit,
        output: Buffer.concat(output).toString().trim(),
      };
    }

    const timeoutError = new Error(
      "Cleanup command exceeded its settlement deadline",
    );
    const failures: unknown[] = [timeoutError];
    try {
      if (child.pid)
        await signalOwnedGroup({ id: child.pid, signal: "SIGKILL" });
      else child.kill("SIGKILL");
    } catch (error) {
      failures.push(error);
      child.kill("SIGKILL");
    } finally {
      // A detached descendant may keep the captured pipe open after its leader exits.
      child.stdout?.destroy();
    }

    const settlement = await settleOwnedProcesses(
      [exit],
      processGroupKillSettlementMs,
    );
    if (settlement.kind === "settled")
      failures.push(
        ...settlement.results.flatMap((result) =>
          result.status === "rejected" ? [result.reason] : [],
        ),
      );
    else
      failures.push(
        new Error("Cleanup process group did not settle after SIGKILL"),
      );
    throw new AggregateError(failures, timeoutError.message);
  }
  /** Удаляет завершённый дочерний процесс из учёта; наблюдение за его process group ведётся отдельно. */
  #settled(child: ChildProcess) {
    this.#children.delete(child);
  }
  /** Создаёт detached дочерний процесс после проверки отмены и регистрирует exit/group settlement. Режим capture отдаёт pipes вызывающему владельцу; отмена после spawn также запрашивает остановку. */
  #start(input: ProcessInput, captured: boolean) {
    this.#signal.throwIfAborted();
    const [executable, ...args] = input.args;
    if (!executable) throw new Error("Process executable is required");
    const stdio = input.quiet ? "ignore" : "inherit";
    const child = spawn(executable, args, {
      cwd: input.cwd,
      env: input.env,
      detached: true,
      stdio: captured ? ["ignore", "pipe", "pipe"] : stdio,
    });
    const exit = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
    this.#children.set(child, exit);
    if (child.pid) {
      const group = new OwnedProcessGroup(child.pid);
      this.#groups.set(group, group.settled);
      void group.settled.then(
        () => this.#groups.delete(group),
        () => {},
      );
      if (this.#signal.aborted) group.stop();
    }
    return { child, exit };
  }
  /** Ждёт exit code запущенной команды и снимает дочерний процесс с учёта в finally; ненулевой код сохраняет как результат. */
  async run(input: ProcessInput) {
    const { child, exit } = this.#start(input, false);
    try {
      return await exit;
    } finally {
      this.#settled(child);
    }
  }
  /** Возвращает обрезанный stdout успешной команды. stderr потребляет без хранения, чтобы не переносить секретные argv/config в ошибку; ненулевой код отклоняет promise, учёт очищает в finally. */
  async capture(input: ProcessInput) {
    const { child, exit } = this.#start(input, true);
    const output: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => output.push(chunk));
    // Docker diagnostic output can contain secret argv/config: retain no stderr.
    child.stderr?.resume();
    try {
      const code = await exit;
      if (code !== 0)
        throw new Error(
          `${input.args[0]} command failed (exit${code}); check selected local infrastructure`,
        );
      return Buffer.concat(output).toString().trim();
    } finally {
      this.#settled(child);
    }
  }
  /** Собирает только отклонённые settlements в AggregateError; успешные результаты, включая exit codes, дополнительно не интерпретирует. */
  #assertSettled(results: readonly PromiseSettledResult<unknown>[]) {
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Owned process cleanup failed",
      );
  }
  /** Снимает abort listener, запрашивает остановку групп и запускает cleanup в обратном порядке регистрации. Ограниченно ждёт их вместе с дочерними процессами; timeout и rejection явно сообщают незавершённую очистку. */
  async close() {
    this.#signal.removeEventListener("abort", this.#abort);
    this.#abort();
    const cleanups = [...this.#cleanups].reverse().map((cleanup) => cleanup());
    const outcome = await settleOwnedProcesses(
      [...this.#groups.values(), ...cleanups, ...this.#children.values()],
      ownedProcessesShutdownTimeoutMs,
    );
    if (outcome.kind === "timed-out")
      throw new Error("Owned processes and cleanup did not settle in time");
    this.#assertSettled(outcome.results);
  }
}
