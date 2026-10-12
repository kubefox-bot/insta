import type { OutboxLifecycleAuth } from "../lib/types";
import type { Queue } from "../ports/queue";

/**
 * Регистрирует очистку сохранённой очереди на всё время жизни auth-host, независимо
 * от страницы чатов. Каждый logout приобретает отдельное ленивое соединение и
 * закрывает его после settlement; снятие регистрации не прерывает начатую очистку.
 */
export const registerOutboxLogout = ({
  auth,
  createQueue,
  changed,
}: Readonly<{
  auth: Pick<OutboxLifecycleAuth, "registerLogout">;
  createQueue: () => Pick<Queue, "clear" | "close">;
  changed: () => void;
}>) =>
  auth.registerLogout(async (actor) => {
    if (!actor) return;
    const queue = createQueue();
    try {
      const result = await queue.clear(actor.ownerId);
      if (result.isError()) throw new Error(result.getError());
      changed();
    } finally {
      queue.close();
    }
  });
