import type { ReadUsers } from "../ports/read-users";
/**
 * Предоставляет другим capabilities публичный поиск active-пользователя через read-порт,
 * сохраняя его исход отсутствия и ошибки.
 */
export const findPublicUser = (
  input: Readonly<{ id: string }>,
  dependencies: Readonly<{ users: ReadUsers }>,
) => dependencies.users.findActive(input);
