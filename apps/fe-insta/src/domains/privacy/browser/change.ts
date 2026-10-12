import { Result } from "@bloodyowl/boxed";
import type { Choice, PublicPreference } from "@insta/contracts/privacy";
import { persistChoice } from "./persist";
import type { BrowserOwner } from "./types";

/**
 * Завершает актуальную мутацию после сохранения и очистки: ошибка оставляет необходимый режим,
 * успешный выбор может запустить телеметрию при активном монтаже.
 */
const completeChange = async ({
  owner: { state, view, telemetry },
  epoch,
  saved,
  cleaned,
}: Readonly<{
  owner: BrowserOwner;
  epoch: number;
  saved: Result<PublicPreference, unknown>;
  cleaned: Result<void, unknown>;
}>) => {
  if (epoch !== state.mutationEpoch) return;
  ++state.epoch;
  /**
   * Фиксирует локальный запрет необязательной телеметрии и состояние ошибки без нового
   * серверного сохранения.
   */
  const denyLocally = () => {
    state.current = { ...state.current, choice: "necessary" };
    state.locallyDenied = true;
    view.set({ preference: state.current, status: "error" });
  };
  if (saved.isOk()) state.current = saved.get();
  if (saved.isError() || cleaned.isError()) {
    denyLocally();
    return;
  }
  state.locallyDenied = false;
  view.set({ preference: state.current, status: "ready" });
  if (!state.mounted) return;
  const started = await Result.fromPromise(telemetry.start(state.current));
  if (epoch !== state.mutationEpoch) return;
  if (started.isError()) denyLocally();
};

/**
 * Создаёт операцию явного выбора: немедленно запрещает телеметрию, параллельно останавливает
 * её и сохраняет предпочтение, затем применяет только актуальный результат.
 */
export const createChange = (owner: BrowserOwner) => async (choice: Choice) => {
  const { state, view, preferences, telemetry, synchronization } = owner;
  const epoch = ++state.mutationEpoch;
  ++state.epoch;
  state.locallyDenied = true;
  state.current = { ...state.current, choice: "necessary" };
  view.set({ preference: state.current, status: "saving" });
  const cleanup = Result.fromPromise(telemetry.stop());
  const saved = await Result.fromPromise(
    persistChoice({ choice, preferences, synchronization }),
  );
  if (saved.isOk()) synchronization.publish();
  const cleaned = await cleanup;
  await completeChange({ owner, epoch, saved, cleaned });
};
