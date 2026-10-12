import { RealtimeErrorCode } from "@insta/contracts/realtime";
import type { RecoveryDependencies } from "./types";

/** Отписывается до canonical use case, который сохраняет prepare→snapshot→activate barrier. */
const restore = async ({
  id,
  entry,
  active,
  recover,
  report,
}: RecoveryDependencies) => {
  await entry.lifecycle.close();
  if (!active()) return;
  if (!recover) throw new Error("Canonical recovery unavailable");
  const outcome = await recover(id);
  if (!active()) return;
  if (outcome.kind !== "applied") throw new Error("Canonical recovery failed");
  entry.recoveryPhase = "idle";
  report(undefined);
};
/** Резервирует один resync синхронно; returned launch начинает I/O после wire callback. */
export const claimRecovery = (dependencies: RecoveryDependencies) => {
  const { entry, report } = dependencies;
  if (entry.recoveryPhase !== "idle") return undefined;
  const claim = ++entry.recoveryGeneration;
  const active = () =>
    dependencies.active() && entry.recoveryGeneration === claim;
  entry.recoveryPhase = "reserved";
  report(RealtimeErrorCode.ResyncRequired);
  return () => {
    if (!active() || entry.recovery) return;
    entry.recoveryPhase = "running";
    const operation = restore({ ...dependencies, active })
      .catch(() => {
        if (active()) {
          entry.recoveryPhase = "failed";
          report(RealtimeErrorCode.ResyncRequired);
        }
      })
      .finally(() => {
        if (entry.recovery === operation) entry.recovery = null;
      });
    entry.recovery = operation;
  };
};
