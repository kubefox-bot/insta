import { connectDragonfly as connect } from "@insta/fe-core/dragonfly/server";
/** Подключает Dragonfly с заданным таймаутом; ошибка подключения сохраняется как cause, клиент закрывает вызывающий владелец. */
export const connectDragonfly = async ({
  config,
}: {
  readonly config: { readonly url: string; readonly timeoutMs: number };
}) => {
  try {
    return await connect(config);
  } catch (error) {
    throw new Error("Dragonfly connection unavailable", {
      cause: error,
    });
  }
};
