import { CommonErrorCode, DirectoryErrorCode } from "@insta/contracts/errors";
import { Controller, Get, Headers, Inject, Query, Res } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import type { NativeResponse } from "../../../../../lib/http/index";
import {
  createValidationException,
  readCorrelation,
} from "../../../../../lib/http/index";
import { authDependenciesToken } from "../../../auth/adapters/http/conts";
import { authFailure } from "../../../auth/adapters/http/reply";
import { authFailureSchema } from "../../../auth/adapters/http/session.dto";
import { authorizeBearer } from "../../../auth/adapters/http/session.guard";
import type { AuthDependencies } from "../../../auth/ports/dependencies";
import { directoryPolicy } from "../../domain/conts";
import { searchUsers } from "../../use-cases/search";
import {
  directoryDependenciesToken,
  directoryErrorStatus,
  retryAfterSeconds,
} from "./conts";
import {
  directoryFailureSchema,
  directoryQuerySchema,
  directorySuccessSchema,
} from "./directory.dto";
import type { DirectoryDependencies } from "./types";
@Controller("v1/users")
@ApiBearerAuth()
@ApiResponse({ status: 401, standardSchema: authFailureSchema })
@ApiResponse({ status: 400, standardSchema: directoryFailureSchema })
@ApiResponse({ status: 429, standardSchema: directoryFailureSchema })
@ApiResponse({ status: 503, standardSchema: directoryFailureSchema })
export class DirectoryController {
  /**
   * Принимает auth и необязательные directory-порты; null directory означает
   * недоступность поиска при сохранении проверки доступа.
   */
  constructor(
    @Inject(authDependenciesToken) private readonly auth: AuthDependencies,
    @Inject(directoryDependenciesToken)
    private readonly dependencies: DirectoryDependencies | null,
  ) {}
  /**
   * Авторизует bearer, валидирует query и запускает поиск с квотой; ошибки переводит в
   * HTTP, для rate limit добавляет Retry-After и всегда запрещает кэширование.
   */
  @Get()
  @ApiOperation({ operationId: "searchUsers" })
  @ApiQuery({
    name: "q",
    type: String,
    required: true,
    minLength: directoryPolicy.minQueryLength,
    maxLength: directoryPolicy.maxQueryLength,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: {
      type: "integer",
      minimum: 1,
      maximum: directoryPolicy.maxLimit,
      default: directoryPolicy.defaultLimit,
    },
  })
  @ApiResponse({ status: 200, standardSchema: directorySuccessSchema })
  async search(
    @Query() query: unknown,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const actor = await authorizeBearer(headers, this.auth);
    if (actor.isError())
      return authFailure({ code: actor.getError(), response, meta });
    const input = directoryQuerySchema.safeParse(query);
    if (!input.success) throw createValidationException([]);
    if (!this.dependencies) {
      response.status(directoryErrorStatus.DEPENDENCY_UNAVAILABLE);
      return {
        ok: false,
        error: {
          code: CommonErrorCode.DependencyUnavailable,
          message: "Directory unavailable",
        },
        meta,
      };
    }
    const result = await searchUsers(
      { actor: actor.get(), query: input.data.q, limit: input.data.limit },
      this.dependencies,
    );
    if (result.isError()) {
      response.status(directoryErrorStatus[result.getError()]);
      if (result.getError() === DirectoryErrorCode.DirectoryRateLimited)
        response.setHeader("Retry-After", String(retryAfterSeconds));
      return {
        ok: false,
        error: { code: result.getError(), message: "Directory request failed" },
        meta,
      };
    }
    return { ok: true, data: { items: result.get() }, meta };
  }
}
