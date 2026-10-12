import type { QueueActor } from "../domain/types";
import type { OutboxDependencies, OutboxRuntime } from "./types";
/** Назначает пробуждение по ближайшей queued-записи только при живом владельце и сети; ошибку чтения оставляет без таймера. */
export const scheduleNext = async ({
  actor,
  dependencies,
  state,
  wake,
}: Readonly<{
  actor: QueueActor;
  dependencies: OutboxDependencies;
  state: OutboxRuntime;
  wake: () => void;
}>) => {
  const { queue, auth, clock } = dependencies;
  const listed = await queue.list(actor.ownerId);
  if (
    state.disposed ||
    listed.isError() ||
    auth.current()?.generation !== actor.generation ||
    !auth.online()
  )
    return;
  const pending = listed.get().filter((record) => record.state === "queued");
  if (!pending.length) return;
  const next = Math.min(...pending.map((record) => record.nextAttemptAt));
  state.timer = setTimeout(wake, Math.max(0, next - clock()));
};
