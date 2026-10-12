import { shutdownTimeoutMs } from "../host/conts";
import { processGroupKillSettlementMs, processGroupPollMs } from "./conts";
import { signalOwnedGroup } from "./group-signal";

export class OwnedProcessGroup {
  readonly #id: number;
  #stopRequested = false;
  #termSentAt: number | undefined = undefined;
  #killRequestedAt: number | undefined = undefined;
  readonly settled: Promise<void>;
  /** Закрепляет PID принадлежащей группы и сразу начинает наблюдение за её исчезновением; rejection остаётся доступным через settled без необработанного фонового отказа. */
  constructor(id: number) {
    this.#id = id;
    this.settled = this.#waitForSettlement();
    // Keep failures observable by close without an unhandled background rejection.
    void this.settled.catch(() => {});
  }
  /** Помечает запрос завершения группы; фактические сигналы отправляет уже работающий цикл наблюдения. */
  stop() {
    this.#stopRequested = true;
  }
  /** После запроса посылает SIGTERM, затем по истечении grace period однократно SIGKILL. false означает уже отсутствующую группу; ошибки сигналов не скрываются. */
  async #requestTermination() {
    if (!this.#stopRequested) return true;
    if (this.#termSentAt === undefined) {
      if (!(await signalOwnedGroup({ id: this.#id, signal: "SIGTERM" })))
        return false;
      this.#termSentAt = performance.now();
    }
    if (this.#killRequestedAt !== undefined) return true;
    if (performance.now() - this.#termSentAt < shutdownTimeoutMs) return true;
    if (!(await signalOwnedGroup({ id: this.#id, signal: "SIGKILL" })))
      return false;
    this.#killRequestedAt = performance.now();
    return true;
  }
  /** Опрашивает существование группы и выполняет запрошенную остановку; если группа не исчезла после SIGKILL в установленный срок, отклоняет settled. */
  async #waitForSettlement() {
    while (await signalOwnedGroup({ id: this.#id, signal: 0 })) {
      if (!(await this.#requestTermination())) return;
      const now = performance.now();
      if (
        this.#killRequestedAt !== undefined &&
        now - this.#killRequestedAt >= processGroupKillSettlementMs
      )
        throw new Error("Owned process group did not settle after SIGKILL");
      await Bun.sleep(processGroupPollMs);
    }
  }
}
