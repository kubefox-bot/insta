import type { Server } from "node:http";
import { attachAnalytics } from "../composition/index";
import { configureHttp } from "../http/index";
import { attachRealtime } from "../realtime/index";
import { closeHttpServer } from "./http";
import type { ApplicationServicesStartup } from "./types";

/** Настраивает HTTP и регистрирует realtime/analytics cleanup в lifecycle до запуска listener. */
export const attachApplicationServices = async ({
  app,
  dependencies,
  observability,
  lifecycle,
}: ApplicationServicesStartup) => {
  const server = await lifecycle.start({
    name: "services",
    /** Получает HTTP-сервер Nest для регистрации cleanup стадии служб до начала прослушивания. */
    start: () => app.getHttpServer(),
    /** Закрывает HTTP и runtime workers через общий settlement owner стадии служб. */
    close: (resource) =>
      closeApplicationServices({
        server: resource,
        realtime: undefined,
        analytics: undefined,
        stopWorkers: dependencies.stopWorkers,
      }),
  });
  configureHttp({
    app,
    readiness: dependencies,
    privacy: dependencies.privacy,
    observability,
  });
  await lifecycle.start({
    name: "services",
    /** Подключает realtime к принадлежащему приложению HTTP-серверу и регистрируемым runtime capabilities. */
    start: () =>
      attachRealtime({
        server,
        dependencies,
        ...(observability ? { observability } : {}),
      }),
    /** Ждёт закрытия подключённого realtime runtime; offline-композиция не требует этого ресурса. */
    close: async (resource) => {
      await resource?.close();
    },
  });
  await lifecycle.start({
    name: "services",
    /** Подключает необязательную analytics-службу к уже собранным outbox и наблюдаемости. */
    start: () =>
      attachAnalytics({ dependencies: dependencies.analytics, observability }),
    /** Ждёт закрытия analytics-службы, если она была создана для runtime. */
    close: async (resource) => {
      await resource?.close();
    },
  });
};

/** Закрывает HTTP, realtime, analytics и workers параллельно; ошибка возвращается только после settlement всех операций. */
export const closeApplicationServices = async ({
  server,
  realtime,
  analytics,
  stopWorkers,
}: Readonly<{
  server: Server;
  realtime: Readonly<{ close: () => Promise<void> }> | undefined;
  analytics: Readonly<{ close: () => Promise<void> }> | undefined;
  stopWorkers: (() => Promise<void>) | undefined;
}>) => {
  const results = await Promise.allSettled([
    closeHttpServer(server),
    realtime?.close(),
    analytics?.close(),
    stopWorkers?.(),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
};
