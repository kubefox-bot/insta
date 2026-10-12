import { get } from "svelte/store";
import {
  type ConversationStore,
  createReceiptTransport,
  mountReceiptAcknowledgments,
} from "../../../domains/conversations/browser/index";
import type { Actor, AuthBrowser } from "../../../domains/users/browser/index";
/**
 * Подключает подтверждения receipts к store и текущему actor, передаёт REST transport и
 * отменяемые таймеры; вызывающий владеет возвращённым dispose.
 */
export const createRuntimeReceipts = ({
  actor,
  store,
  auth,
  onReadAcknowledged,
}: Readonly<{
  actor: Actor;
  store: ConversationStore;
  auth: AuthBrowser;
  onReadAcknowledged?: () => void;
}>) =>
  mountReceiptAcknowledgments({
    actor,
    store,
    /**
     * Читает актуальный actor из auth view при проверке принадлежности receipt работы.
     */
    currentActor: () => get(auth.view).actor,
    acknowledge: createReceiptTransport({ actor }).acknowledge,
    onReadAcknowledged,
    clock: {
      now: Date.now,
      /**
       * Планирует попытку подтверждения и отдаёт владельцу receipts отмену именно этого таймера.
       */
      schedule: (run, delayMs) => {
        const timer = setTimeout(run, delayMs);
        return () => clearTimeout(timer);
      },
    },
  });
