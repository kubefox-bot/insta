import { derived, writable } from "svelte/store";
import type { QueueActor } from "../domain/types";
import type { Queue } from "../ports/queue";
import type {
  OutboxDependencies,
  OutboxProjection,
  OutboxRuntime,
  OutboxView,
} from "./types";

/** Строит представление владельца из результата чтения, отличая ошибку persistence от пустой очереди. */
const projectRecords = ({
  actor,
  records,
  busy,
}: Readonly<{
  actor: QueueActor;
  records: Awaited<ReturnType<Queue["list"]>>;
  busy: boolean;
}>): Readonly<{
  view: OutboxView;
  status: "ready" | "read-failed";
}> => {
  const base = { ownerId: actor.ownerId, busy };
  if (records.isError())
    return {
      view: {
        ...base,
        records: [],
        issue: records.getError(),
        issueSource: "read",
      },
      status: "read-failed",
    };
  return { view: { ...base, records: records.get() }, status: "ready" };
};

/** Создаёт приватный writable и читаемую проекцию очереди с защитой асинхронного чтения по эпохе. */
export const createProjection = ({
  dependencies,
  state,
}: Readonly<{
  dependencies: OutboxDependencies;
  state: OutboxRuntime;
}>): OutboxProjection => {
  const view = writable<OutboxView>({
    ownerId: null,
    records: [],
    busy: false,
  });
  const { auth, queue } = dependencies;
  return {
    view: derived(view, (value) => value),
    /** Скрывает приватные записи и диагностику предыдущего владельца. */
    clear: () => view.set({ ownerId: null, records: [], busy: false }),
    /** Обновляет индикатор работы, сохраняя записи и диагностику проекции. */
    busy: (value) => view.update((current) => ({ ...current, busy: value })),
    /** Публикует код и источник сбоя без замены текущих записей. */
    issue: ({ code, source }) =>
      view.update((current) => ({
        ...current,
        issue: code,
        issueSource: source,
      })),
    /** Читает очередь текущего владельца; результат устаревшей эпохи или поколения не публикует, ошибку чтения показывает явно. */
    refresh: async () => {
      const actor = auth.current();
      const epoch = state.epoch;
      if (!actor) {
        view.set({ ownerId: null, records: [], busy: false });
        return "ready";
      }
      const records = await queue.list(actor.ownerId);
      if (
        state.disposed ||
        epoch !== state.epoch ||
        auth.current()?.generation !== actor.generation
      )
        return "stale";
      const projected = projectRecords({
        actor,
        records,
        busy: Boolean(state.running),
      });
      view.set(projected.view);
      return projected.status;
    },
  };
};
