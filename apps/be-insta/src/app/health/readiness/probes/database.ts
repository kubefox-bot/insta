import type { Db } from "mongodb";
/** Проверяет Mongo ping; ошибка провайдера превращается в неготовность только на диагностической границе. */
export const checkDatabaseReadiness = (
  database: Pick<Db, "command">,
): Promise<boolean> =>
  database.command({ ping: 1 }).then(
    () => true,
    () => false,
  );
