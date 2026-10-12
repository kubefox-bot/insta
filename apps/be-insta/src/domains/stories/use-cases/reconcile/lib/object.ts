import type { StoryOwnership } from "../../../ports/maintenance/interfaces";
import type {
  StoredIdentity,
  StoryStorage,
} from "../../../ports/storage/interfaces";
/**
 * Удаляет только объект разрешённого профиля/префикса с подтверждённым отсутствием
 * ownership. Ошибка чтения ownership сохраняет объект; отмена предотвращает новое
 * удаление.
 */
export const reconcileObject = async (
  input: Readonly<{
    object: StoredIdentity;
    profile: string;
    prefix: string;
    signal?: AbortSignal;
  }>,
  dependencies: Readonly<{
    ownership: StoryOwnership;
    storage: Pick<StoryStorage, "delete">;
  }>,
) => {
  if (
    input.object.profile !== input.profile ||
    !input.object.key.startsWith(input.prefix)
  )
    throw new Error("Inventory outside Stories namespace");
  const ownership = await dependencies.ownership.read(input.object);
  switch (ownership.kind) {
    case "error":
      throw new Error("Stories ownership unavailable");
    case "found":
      return;
    case "missing":
      if (!input.signal?.aborted)
        await dependencies.storage.delete(input.object);
      return;
    default: {
      const impossible: never = ownership.kind;
      throw new Error(`Unexpected ownership ${impossible}`);
    }
  }
};
