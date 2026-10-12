import type { DeliveryStream } from "../../../ports/delivery/types";
import { deliveryNamespace } from "./conts";
/** Формирует приватные ключи одного stream; epoch проверяется отдельно в атомарной metadata. */
export const streamKeys = (streamId: string) => [
  `${streamId}:lease`,
  `${streamId}:state`,
  `${streamId}:entries`,
];
/** Выделяет полный ключ только для отдельного blocking client, которому EVAL не подходит. */
export const readerKey = ({
  generation,
  stream,
}: Readonly<{ generation: string; stream: DeliveryStream }>) =>
  `${deliveryNamespace.keyPrefix}:${generation}:${stream.kind}:${stream.id}:entries`;
