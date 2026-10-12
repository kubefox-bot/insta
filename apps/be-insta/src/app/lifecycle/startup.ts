import { startupCloseOrder } from "./conts";
import type { StartupResource, StartupStageName } from "./types";

type ListeningApplication = Readonly<{
  listen: (port: number, host: string) => Promise<unknown>;
}>;

/** Ведёт реестр приобретённых ресурсов по стадиям; повторное закрытие стадии разделяет Promise, полный cleanup идёт в заданном порядке. */
export const createStartupLifecycle = () => {
  const resources = new Map<StartupStageName, Array<() => Promise<void>>>();
  const closingStages = new Map<StartupStageName, Promise<void>>();
  /** Регистрирует closer только после успешного получения ресурса; неуспешный start не добавляется в реестр. */
  const start = async <Resource>({
    name,
    start,
    close,
  }: StartupResource<Resource>) => {
    const resource = await start();
    const closers = resources.get(name) ?? [];
    closers.push(() => close(resource));
    resources.set(name, closers);
    return resource;
  };
  /** Закрывает все ресурсы стадии и ждёт их settlement; повторные вызовы не запускают closers повторно. */
  const closeStage = (name: StartupStageName): Promise<void> => {
    const closing = closingStages.get(name);
    if (closing) return closing;
    const settlement = Promise.allSettled(
      (resources.get(name) ?? []).map((close) => Promise.resolve().then(close)),
    ).then((results) => {
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    });
    closingStages.set(name, settlement);
    return settlement;
  };
  /** Закрывает стадии в установленном порядке; ошибки cleanup журналируются и не мешают освобождению следующих стадий. */
  const close = async () => {
    for (const name of startupCloseOrder) {
      try {
        await closeStage(name);
      } catch {
        process.stderr.write(`Application startup ${name} cleanup failed\n`);
      }
    }
  };
  return { start, closeStage, close };
};

/** Открывает listener подготовленного приложения; при ошибке listen выполняет cleanup и сохраняет исходную ошибку старта. */
export const startApplication = async <
  Application extends ListeningApplication,
>({
  prepare,
  port,
  host,
}: Readonly<{
  prepare: () => Promise<
    Readonly<{ app: Application; close: () => Promise<void> }>
  >;
  port: number;
  host: string;
}>): Promise<Application> => {
  const prepared = await prepare();
  try {
    await prepared.app.listen(port, host);
    return prepared.app;
  } catch (error) {
    try {
      await prepared.close();
    } catch {
      process.stderr.write("Application startup cleanup failed\n");
    }
    throw error;
  }
};
