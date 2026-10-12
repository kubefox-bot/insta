import type { RecoveryIdentity } from "../../ports/recovery/types";
import type { Dependencies, Selection } from "./types";

/** Сравнивает значимые поля identity, не считая диагностические обновления сменой владельца. */
const sameIdentity = (left: RecoveryIdentity, right: RecoveryIdentity) =>
  left.status === right.status &&
  left.actor?.userId === right.actor?.userId &&
  left.actor?.generation === right.actor?.generation;
/** Владеет поколением выбора и синхронной identity-подпиской, исключая ABA без второго auth store. */
export const createActionLifetime = (
  dependencies: Pick<Dependencies, "currentIdentity" | "subscribeIdentity">,
) => {
  let generation = 0;
  let disposed = false;
  let identity = dependencies.currentIdentity();
  /** Инвалидирует ожидающие receipt, не отменяя intent уже переданного UI. */
  const invalidate = () => {
    generation++;
  };
  const unsubscribe = dependencies.subscribeIdentity((next) => {
    if (!sameIdentity(identity, next)) invalidate();
    identity = next;
  });
  return {
    invalidate,
    /** Захватывает готовую identity и новое поколение только для живого выбранного действия. */
    acquire: (isSelected: () => boolean): Selection => {
      if (disposed || !isSelected()) return { kind: "stale" };
      const initial = dependencies.currentIdentity();
      if (initial.status !== "guest" && initial.status !== "authenticated")
        return { kind: "unavailable" };
      return {
        kind: "selected",
        generation: ++generation,
        identity: initial,
        isSelected,
      };
    },
    /** Сверяет захваченные lifetime, выбор автора и identity непосредственно перед handoff. */
    isCurrent: (selection: Extract<Selection, { kind: "selected" }>) =>
      !disposed &&
      generation === selection.generation &&
      selection.isSelected() &&
      sameIdentity(selection.identity, dependencies.currentIdentity()),
    /** Освобождает подписку и запрещает новые захваты; поздний begin сам дожидается адресной отмены. */
    dispose: () => {
      if (disposed) return;
      disposed = true;
      invalidate();
      unsubscribe();
    },
  };
};
