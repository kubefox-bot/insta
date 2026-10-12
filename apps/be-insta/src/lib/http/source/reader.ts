import type { ClientSourceReader } from "@insta/contracts/http";
import { readClientSource } from "./read";
/** Связывает проверку подписанного источника с ключом и часами композиции, не сохраняя состояние запроса. */
export const createClientSourceReader =
  ({
    key,
    clock,
  }: Readonly<{ key?: string; clock: () => number }>): ClientSourceReader =>
  (input) =>
    readClientSource({ ...input, key, now: clock() });
