import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { readCorrelation, resultResponse } from "../../../lib/http/index";
import type { Readiness } from "../readiness/index";
import { HEALTH_STATUS } from "./conts";
import {
  healthFailureSchema,
  healthReadySchema,
  healthSuccessSchema,
  healthUnavailableSchema,
} from "./dto";
@Controller("health")
export class HealthController {
  /** Получает заимствованный readiness-порт из Nest composition; контроллер не владеет инфраструктурными клиентами. */
  constructor(@Inject(HEALTH_STATUS) private readonly readiness: Readiness) {}
  /** Подтверждает доступность HTTP-процесса без проверки внешних зависимостей, сохраняя корреляцию запроса. */
  @Get("live")
  @ApiOperation({ operationId: "getHealthLive" })
  @ApiResponse({ status: 200, standardSchema: healthSuccessSchema })
  @ApiResponse({ status: 500, standardSchema: healthFailureSchema })
  live(@Headers() headers: Readonly<Record<string, unknown>>) {
    return resultResponse({
      result: Result.Ok({ status: "ok" as const }),
      meta: readCorrelation(headers),
    });
  }
  /** Возвращает readiness без кеширования; обязательная недоступность даёт 503, состояние mail сообщается отдельно. */
  @Get("ready")
  @ApiOperation({ operationId: "getHealthReady" })
  @ApiResponse({ status: 200, standardSchema: healthReadySchema })
  @ApiResponse({ status: 503, standardSchema: healthUnavailableSchema })
  @ApiResponse({ status: 500, standardSchema: healthFailureSchema })
  async ready(
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: {
      status: (status: number) => unknown;
      setHeader: (key: string, value: string) => unknown;
    },
  ) {
    const health = await this.readiness.check();
    response.setHeader("Cache-Control", "no-store");
    if (!health.ready) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        ok: false,
        error: {
          code: CommonErrorCode.DependencyUnavailable,
          message: "Required dependency unavailable",
        },
        meta: readCorrelation(headers),
      };
    }
    return resultResponse({
      result: Result.Ok({
        status: "ok" as const,
        mail: health.mail,
        delivery: health.delivery,
      }),
      meta: readCorrelation(headers),
    });
  }
}
