import { CommonErrorCode } from "@insta/contracts/errors";
import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { NativeResponse } from "../../../../../lib/http/index";
import {
  createValidationException,
  readCorrelation,
} from "../../../../../lib/http/index";
import {
  authDependenciesToken,
  authFailure,
  authFailureSchema,
  authorizeBearer,
} from "../../../../users/http/server";
import type { AuthDependencies } from "../../../../users/index";
import { conversationPolicy } from "../../../domain/policy";
import { listHistory } from "../../../use-cases/history/read";
import { conversationsDependenciesToken, maxCursorLength } from "../conts";
import {
  conversationFailureSchema,
  identifierSchema,
} from "../conversations/dto";
import { mapHistory } from "../history/map";
import { conversationFailure } from "../reply";
import type { ConversationsDependencies } from "../types";
import { historyQuerySchema, historySuccessSchema } from "./dto";
import { historyRange } from "./map";

@Controller("v1/conversations")
@ApiTags("Conversation")
@ApiBearerAuth()
@ApiResponse({ status: 401, standardSchema: authFailureSchema })
@ApiResponse({ status: 400, standardSchema: conversationFailureSchema })
@ApiResponse({ status: 403, standardSchema: conversationFailureSchema })
@ApiResponse({ status: 404, standardSchema: conversationFailureSchema })
@ApiResponse({ status: 429, standardSchema: conversationFailureSchema })
@ApiResponse({ status: 503, standardSchema: conversationFailureSchema })
export class HistoryController {
  /**
   * Связывает HTTP истории с auth и необязательным conversation-портом без владения
   * хранилищем.
   */
  constructor(
    @Inject(authDependenciesToken) private readonly auth: AuthDependencies,
    @Inject(conversationsDependenciesToken)
    private readonly dependencies: ConversationsDependencies | null,
  ) {}
  /**
   * Проверяет actor, id и параметры страницы, связывает cursor с беседой; возвращает
   * историю с ISO-датами либо ожидаемый HTTP-отказ.
   */
  @Get(":id/messages")
  @ApiOperation({ operationId: "listHistory" })
  @ApiParam({
    name: "id",
    schema: { type: "string", pattern: "^[a-f0-9]{24}$" },
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    schema: { type: "string", minLength: 1, maxLength: maxCursorLength },
  })
  @ApiQuery({
    name: "after",
    required: false,
    description:
      "Позиция: только десятичные цифры целого safe integer; сырая строка проверяется до Number.",
    schema: {
      type: "integer",
      minimum: 0,
      maximum: conversationPolicy.maxSequence,
    },
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: {
      type: "integer",
      minimum: 1,
      maximum: conversationPolicy.maxHistoryLimit,
      default: conversationPolicy.defaultHistoryLimit,
    },
    description:
      "Первый snapshot без after/cursor требует limit=50; для after/before разрешён диапазон 1–100.",
  })
  @ApiResponse({ status: 200, standardSchema: historySuccessSchema })
  async history(
    @Param("id") conversationId: string,
    @Query() query: unknown,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const actor = await authorizeBearer(headers, this.auth);
    if (actor.isError())
      return authFailure({ code: actor.getError(), response, meta });
    const input = historyQuerySchema.safeParse(query);
    if (!input.success || !identifierSchema.safeParse(conversationId).success)
      throw createValidationException([]);
    const range = historyRange({ input: input.data, conversationId });
    if (!range)
      return conversationFailure({
        code: CommonErrorCode.InvalidCursor,
        response,
        meta,
      });
    if (!this.dependencies)
      return conversationFailure({
        code: CommonErrorCode.DependencyUnavailable,
        response,
        meta,
      });
    const result = await listHistory(
      { actor: actor.get(), conversationId, range, limit: input.data.limit },
      this.dependencies,
    );
    if (result.isError())
      return conversationFailure({ code: result.getError(), response, meta });
    return { ok: true, data: mapHistory(result.get()), meta };
  }
}
