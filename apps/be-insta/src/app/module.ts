import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import {
  ConversationController,
  HistoryController,
  MessageController,
  ReceiptController,
} from "../domains/conversations/http/server";
import { PrivacyController } from "../domains/privacy/http/index";
import {
  StoryController,
  StoryPolicyController,
} from "../domains/stories/http/server";
import { SupportController } from "../domains/support-reports/http/index";
import {
  DirectoryController,
  RegistrationController,
  SessionController,
  TicketController,
} from "../domains/users/http/server";
import { readCorrelation } from "../lib/http/index";
import type { RuntimeObservability } from "../lib/observability/index";
import type { RuntimeDependencies } from "./composition/index";
import { createDomainProviders } from "./composition/index";
import { HEALTH_STATUS, HealthController } from "./health/index";
import {
  type ApplicationServicesLifecycle,
  applicationServicesToken,
} from "./lifecycle/index";
@Module({})
export class AppModule {}
/** Регистрирует Nest transport и lifecycle providers; бизнес-правила остаются в подключённых capabilities. */
export const registerApplication = (
  dependencies: RuntimeDependencies,
  observability?: RuntimeObservability,
  services?: ApplicationServicesLifecycle,
) => ({
  module: AppModule,
  imports: observability
    ? [
        LoggerModule.forRoot({
          pinoHttp: {
            logger: observability.adapter.logger,
            autoLogging: false,
            serializers: {
              /** Исключает сериализацию полного HTTP-запроса из Pino, чтобы не журналировать секреты и payload. */
              req: () => undefined,
              /** Исключает сериализацию полного HTTP-ответа из Pino; completion пишет только разрешённые поля. */
              res: () => undefined,
            },
            /** Использует нормализованную корреляцию запроса как Pino requestId. */
            genReqId: (request) => readCorrelation(request.headers).requestId,
          },
        }),
      ]
    : [],
  controllers: [
    HealthController,
    PrivacyController,
    SessionController,
    TicketController,
    RegistrationController,
    SupportController,
    DirectoryController,
    ConversationController,
    HistoryController,
    MessageController,
    ReceiptController,
    StoryPolicyController,
    StoryController,
  ],
  providers: [
    {
      provide: applicationServicesToken,
      useValue: {
        /** Ждёт закрытия прикладных служб до последующих Nest shutdown hooks инфраструктуры. */
        onModuleDestroy: async () => {
          await services?.close?.();
        },
      },
    },
    ...createDomainProviders(dependencies),
    ...(observability
      ? [
          {
            provide: "OBSERVABILITY_LIFECYCLE",
            useValue: { onApplicationShutdown: observability.close },
          },
        ]
      : []),
    {
      provide: HEALTH_STATUS,
      useValue: {
        /** Делегирует admission-проверку обязательных зависимостей runtime readiness owner. */
        checkRequired: () => dependencies.checkRequired(),
        /** Делегирует полную readiness-проверку, включая отдельное состояние mail. */
        check: () => dependencies.check(),
      },
    },
    {
      provide: "INFRA_LIFECYCLE",
      useValue: { onApplicationShutdown: dependencies.close },
    },
  ],
});
