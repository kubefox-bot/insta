import { Result } from "@bloodyowl/boxed";
import { DirectoryErrorCode } from "@insta/contracts/errors";
import { type Db, ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "../../../adapters/mongo/conts";
import type { ReadUsers } from "../../ports/read-users";

const publicProjection = z.object({
  _id: z.instanceof(ObjectId),
  username: z.string(),
});
/**
 * Подключает публичное чтение active-пользователей к заимствованному Db с проекцией
 * только id/username.
 */
export const createMongoReadUsers = (db: Db): ReadUsers => {
  const users = db.collection(collections.users);
  /**
   * Валидирует публичную Mongo-проекцию и переводит ObjectId в строку; повреждённую
   * запись не выдаёт за отсутствие пользователя.
   */
  const map = (input: unknown) => {
    const user = publicProjection.parse(input);
    return { id: user._id.toHexString(), username: user.username };
  };
  return {
    /**
     * Находит active-пользователя по ObjectId; неверный id или отсутствие дают
     * UserNotFound, ошибки хранилища пробрасываются.
     */
    findActive: async ({ id }) => {
      if (!ObjectId.isValid(id))
        return Result.Error(DirectoryErrorCode.UserNotFound);
      const user = await users.findOne(
        { _id: new ObjectId(id), status: "active" },
        { projection: { _id: 1, username: 1 } },
      );
      return user
        ? Result.Ok(map(user))
        : Result.Error(DirectoryErrorCode.UserNotFound);
    },
    /**
     * Ищет literal prefix username без regex-инъекции, сортирует по usernameKey/id и
     * ограничивает результат перед публичным mapping.
     */
    searchActive: async ({ query, limit }) => {
      const literalPrefix = query
        .toLowerCase()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const found = await users
        .find(
          { status: "active", usernameKey: { $regex: `^${literalPrefix}` } },
          { projection: { _id: 1, username: 1 } },
        )
        .sort({ usernameKey: 1, _id: 1 })
        .limit(limit)
        .toArray();
      return Result.Ok(found.map(map));
    },
  };
};
