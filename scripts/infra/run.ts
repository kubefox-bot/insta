import { terminationSignals } from "@insta/fe-core/lifecycle/server";
import { executeCommand } from "./commands/execute";
import { OwnedProcesses } from "./commands/processes";
import { selectCommand } from "./commands/select";

const controller = new AbortController();
const processes = new OwnedProcesses(controller.signal);
/** Переводит общий controller инфраструктурного сценария в отменённое состояние; зарегистрированный владелец процессов отвечает за фактическое завершение. */
const cancel = () =>
  controller.abort(new Error("Infrastructure command cancelled"));
for (const signal of terminationSignals) process.on(signal, cancel);
try {
  process.exitCode = await executeCommand({
    command: selectCommand(process.argv[2]),
    processes,
    signal: controller.signal,
  });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Infrastructure command failed",
  );
  process.exitCode = 1;
} finally {
  await processes.close();
  for (const signal of terminationSignals) process.off(signal, cancel);
}
