import { terminationSignals } from "@insta/fe-core/lifecycle/server";
import { createPreparedApplication } from "./app/bootstrap";
import { connectDependencies } from "./app/composition/index";
import { createShutdown, startApplication } from "./app/lifecycle/index";
import { readRuntimeConfig } from "./lib/config/index";

/** Читает runtime-конфигурацию, запускает приложение и регистрирует graceful shutdown с отдельным аварийным исходом. */
const start = async () => {
  const config = readRuntimeConfig();
  const dependencies = await connectDependencies(config);
  const app = await startApplication({
    /** Готовит Nest-приложение с runtime-наблюдаемостью до открытия HTTP listener. */
    prepare: () =>
      createPreparedApplication(dependencies, {
        mode: "runtime",
        ...config.observability,
      }),
    port: config.port,
    host: config.host,
  });
  const shutdown = createShutdown({
    /** Передаёт graceful shutdown владельцу приложения и возвращает его Promise. */
    close: () => app.close(),
    /** Принудительно закрывает HTTP-соединения при истечении shutdown watchdog. */
    forceClose: () => app.getHttpServer().closeAllConnections(),
    /** Фиксирует неизвестный исход незавершённых эффектов и завершает процесс с ошибкой при истечении watchdog. */
    onFailure: () => {
      process.stderr.write(
        "Application shutdown deadline exceeded; pending effects remain unknown\n",
      );
      process.exit(1);
    },
  });
  for (const signal of terminationSignals)
    process.on(signal, () => {
      shutdown(signal).catch(() => {
        process.stderr.write(
          "Application shutdown failed; pending effects retained\n",
        );
        process.exit(1);
      });
    });
};
try {
  await start();
} catch {
  process.stderr.write(
    "Application startup failed; verify configuration and required dependencies\n",
  );
  process.exit(1);
}
