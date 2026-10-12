import { z } from "zod";
import { deliveryNamespace, reclaimPolicy } from "./conts";
import type { OwnedDeliveryKey, StreamsDependencies } from "./types";
/** Валидирует единственную ограниченную страницу; не удерживает произвольный ответ провайдера. */
export const scanOwnedPage = async (
  cursor: string,
  dependencies: StreamsDependencies,
) =>
  z
    .tuple([
      z.string().regex(/^\d+$/),
      z.array(z.string()).max(reclaimPolicy.maximumReturnedKeys),
    ])
    .parse(
      await dependencies.client.send("SCAN", [
        cursor,
        "MATCH",
        `${deliveryNamespace.keyPrefix}:*`,
        "COUNT",
        String(reclaimPolicy.scanCount),
      ]),
    );
/** Распознаёт только приватные ключи delivery, сохраняя неизвестные ключи даже внутри namespace. */
export const parseOwnedKey = (key: string): OwnedDeliveryKey | null => {
  const prefix = `${deliveryNamespace.keyPrefix}:`;
  if (!key.startsWith(prefix)) return null;
  const match =
    /^([a-f0-9]{40}):([^:]+):(conversation|unread):(.+):(lease|state|entries)$/.exec(
      key.slice(prefix.length),
    );
  if (!match || !z.uuid().safeParse(match[2]).success) return null;
  const [, identity, nonce, kind, id, suffix] = match;
  if ((kind !== "conversation" && kind !== "unread") || !id) return null;
  return { generation: `${identity}:${nonce}`, stream: { kind, id }, suffix };
};
