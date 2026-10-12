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
import {
  type NativeResponse,
  readCorrelation,
} from "../../../../../lib/http/index";
import type { StoryDependencies } from "../../../ports/persistence/interfaces";
import { storiesDependenciesToken } from "../conts";
import { storyFailureSchema } from "../story.dto";
import { policySuccessSchema } from "./dto";
@Controller("v1/stories/policy")
export class StoryPolicyController {
  /**
   * Принимает только публичную policy Stories либо null для отключённого Core-профиля;
   * storage-конфигурация сюда не передаётся.
   */
  constructor(
    @Inject(storiesDependenciesToken)
    private readonly dependencies: Pick<StoryDependencies, "policy"> | null,
  ) {}
  /**
   * Выдаёт текущую policy новых публикаций с no-store и корреляцией; отключённые Stories
   * возвращают 404. Сроки существующих историй не пересчитывает.
   */
  @Get()
  @ApiOperation({ operationId: "readStoryPolicy" })
  @ApiResponse({ status: 200, standardSchema: policySuccessSchema })
  @ApiResponse({ status: 404, standardSchema: storyFailureSchema })
  read(
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    if (!this.dependencies) {
      response.status(HttpStatus.NOT_FOUND);
      return {
        ok: false,
        error: {
          code: CommonErrorCode.DependencyUnavailable,
          message: "Stories unavailable",
        },
        meta,
      };
    }
    return { ok: true, data: this.dependencies.policy, meta };
  }
}
