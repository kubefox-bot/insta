import { connectLifecycle } from "./lib/lifecycle";
import { createOperations } from "./lib/operations";
import { createPass } from "./lib/pass";
import { createProjection } from "./lib/projection";
import type {
  OutboxBrowser,
  OutboxDependencies,
  OutboxRuntime,
} from "./lib/types";
/** Собирает приватное состояние очереди, проекцию, отправку и lifecycle; потребитель обязан вызвать dispose для освобождения ресурсов. */
export const createOutbox = (
  input: Omit<OutboxDependencies, "clock" | "uuid" | "jitter"> &
    Partial<Pick<OutboxDependencies, "clock" | "uuid" | "jitter">>,
): OutboxBrowser => {
  const dependencies: OutboxDependencies = {
    clock: Date.now,
    /** Выдаёт случайную идентичность для записи, клиентского сообщения или идемпотентной операции при постановке в очередь. */
    uuid: () => crypto.randomUUID(),
    jitter: Math.random,
    ...input,
  };
  const state: OutboxRuntime = {
    disposed: false,
    epoch: 0,
    confirmationControllers: new Set(),
  };
  const projection = createProjection({ dependencies, state });
  const { wake, background } = createPass({ dependencies, state, projection });
  const dispose = connectLifecycle({
    dependencies,
    state,
    projection,
    background,
  });
  const operations = createOperations({
    dependencies,
    state,
    projection,
    background,
  });
  return { view: projection.view, wake, dispose, ...operations };
};
