import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ExpressAdapter } from "@nestjs/platform-express";
import {
  createObservability,
  defaultOptions,
  type ObservabilityOptions,
} from "../lib/observability/index";
import type { RuntimeDependencies } from "./composition/index";
import { installDocumentation } from "./docs/index";
import {
  attachApplicationServices,
  createStartupLifecycle,
} from "./lifecycle/index";
import { registerApplication } from "./module";
/** Готовит Nest и службы с поэтапным владением ресурсами; при ошибке откатывает уже приобретённые стадии без открытия listener. */
export const createPreparedApplication = async (
  dependencies: RuntimeDependencies = {
    /** Оставляет offline-приложение неготовым для бизнес-запросов без подключённой инфраструктуры. */
    checkRequired: async () => false,
    /** Возвращает явную неготовность и degraded mail для offline-композиции документации. */
    check: async () => ({
      ready: false,
      mail: "degraded",
      delivery: "degraded",
    }),
    /** Завершает offline-зависимости без эффектов: эта композиция не приобретает внешние ресурсы. */
    close: async () => {},
  },
  options: ObservabilityOptions = defaultOptions,
) => {
  const lifecycle = createStartupLifecycle();
  const services = {
    /** Закрывает стадию служб через общий lifecycle, исключая повторное освобождение ресурсов. */
    close: () => lifecycle.closeStage("services"),
  };
  try {
    const infrastructure = await lifecycle.start({
      name: "infrastructure",
      /** Передаёт уже подключённые зависимости под владение lifecycle приложения. */
      start: () => dependencies,
      /** Освобождает инфраструктуру зарегистрированным владельцем после завершения потребителей. */
      close: (resource) => resource.close(),
    });
    const runtime = {
      ...infrastructure,
      /** Направляет Nest teardown инфраструктуры в идемпотентное закрытие соответствующей стадии. */
      close: () => lifecycle.closeStage("infrastructure"),
    };
    const acquiredObservability = await lifecycle.start({
      name: "observability",
      /** Создаёт наблюдаемость только для runtime; offline-генерация схем не открывает telemetry-ресурсы. */
      start: () =>
        options.mode === "runtime" ? createObservability(options) : undefined,
      /** Ждёт закрытия наблюдаемости, если runtime создал её на этой стадии. */
      close: async (resource) => {
        await resource?.close();
      },
    });
    const observability = acquiredObservability
      ? {
          ...acquiredObservability,
          /** Направляет teardown наблюдаемости через общий lifecycle для однократного закрытия. */
          close: () => lifecycle.closeStage("observability"),
        }
      : undefined;
    const app = await lifecycle.start({
      name: "application",
      /** Создаёт Nest с явными HTTP parser и logger owners; ошибка старта передаётся lifecycle вместо аварийного exit. */
      start: () =>
        NestFactory.create<NestExpressApplication>(
          registerApplication(runtime, observability, services),
          new ExpressAdapter(),
          {
            logger: false,
            abortOnError: false,
            bodyParser: false,
          },
        ),
      /** Закрывает Nest-приложение при откате или штатном завершении стадии. */
      close: (resource) => resource.close(),
    });
    await attachApplicationServices({
      app,
      dependencies: runtime,
      observability,
      lifecycle,
    });
    installDocumentation(app);
    return { app, close: lifecycle.close };
  } catch (error) {
    await lifecycle.close();
    throw error;
  }
};

/** Возвращает подготовленное Nest-приложение; вызывающий код обязан закрыть его после использования. */
export const createApplication = async (
  dependencies?: RuntimeDependencies,
  options?: ObservabilityOptions,
) => (await createPreparedApplication(dependencies, options)).app;
