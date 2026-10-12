import { CommonErrorCode } from "@insta/contracts/errors";
import { httpHeaderNames, httpHeaders } from "@insta/contracts/http";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import { z } from "zod";
import type {
  NativeResponse,
  SwaggerBodySchema,
} from "../../../../../lib/http/index";
import {
  createValidationException,
  readCorrelation,
} from "../../../../../lib/http/index";
import {
  authDependenciesToken,
  authFailure,
  authFailureSchema,
  authorizeBearer,
  idempotencySchema,
} from "../../../../users/http/server";
import type { AuthDependencies } from "../../../../users/index";
import { conversationPolicy } from "../../../domain/policy";
import { listUnreadConversations } from "../../../use-cases/list/read-unread";
import { startConversation } from "../../../use-cases/start/create";
import { conversationsDependenciesToken } from "../conts";
import { createIdempotencyHeaderSchema } from "../idempotency-metadata";
import { conversationFailure } from "../reply";
import type { ConversationsDependencies } from "../types";
import {
  conversationFailureSchema,
  listQuerySchema,
  startSchema,
  startSuccessSchema,
  unreadListSuccessSchema,
} from "./dto";

@Controller("v1/conversations")
@ApiBearerAuth()
@ApiResponse({ status: 401, standardSchema: authFailureSchema })
@ApiResponse({ status: 400, standardSchema: conversationFailureSchema })
@ApiResponse({ status: 403, standardSchema: conversationFailureSchema })
@ApiResponse({ status: 404, standardSchema: conversationFailureSchema })
@ApiResponse({ status: 429, standardSchema: conversationFailureSchema })
@ApiResponse({ status: 503, standardSchema: conversationFailureSchema })
export class ConversationController {
  /**
   * Принимает auth и необязательные conversation-порты от composition; их отсутствие
   * обрабатывается как недоступность capability.
   */
  constructor(
    @Inject(authDependenciesToken) private readonly auth: AuthDependencies,
    @Inject(conversationsDependenciesToken)
    private readonly dependencies: ConversationsDependencies | null,
  ) {}
  /**
   * Авторизует actor и валидирует получателя/idempotency key перед созданием пары; ключ
   * становится operationId, HTTP-ответ запрещает кэширование.
   */
  @Post()
  @ApiOperation({ operationId: "startConversation" })
  @ApiHeader({
    name: httpHeaderNames.idempotencyKey,
    required: false,
    schema: createIdempotencyHeaderSchema(idempotencySchema),
  })
  @ApiBody({ schema: z.toJSONSchema(startSchema) as SwaggerBodySchema })
  @ApiResponse({ status: 200, standardSchema: startSuccessSchema })
  async start(
    @Body() body: unknown,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const actor = await authorizeBearer(headers, this.auth);
    if (actor.isError())
      return authFailure({ code: actor.getError(), response, meta });
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) throw createValidationException([]);
    const key = idempotencySchema.safeParse(
      headers[httpHeaders.idempotencyKey],
    );
    if (!key.success) throw createValidationException([]);
    if (!this.dependencies)
      return conversationFailure({
        code: CommonErrorCode.DependencyUnavailable,
        response,
        meta,
      });
    const result = await startConversation(
      {
        actor: actor.get(),
        recipientId: parsed.data.recipientId,
        operationId: key.data ?? this.dependencies.operationId(),
      },
      this.dependencies,
    );
    if (result.isError())
      return conversationFailure({ code: result.getError(), response, meta });
    response.status(HttpStatus.OK);
    return { ok: true, data: result.get(), meta };
  }
  /**
   * Отдаёт авторизованному actor ограниченный список бесед с unread counts и общим итогом
   * через отдельный unread-сценарий.
   */
  @Get("unread")
  @ApiOperation({ operationId: "listUnreadConversations" })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: {
      type: "integer",
      minimum: 1,
      maximum: conversationPolicy.maxListLimit,
      default: conversationPolicy.defaultListLimit,
    },
  })
  @ApiResponse({ status: 200, standardSchema: unreadListSuccessSchema })
  async unread(
    @Query() query: unknown,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const actor = await authorizeBearer(headers, this.auth);
    if (actor.isError())
      return authFailure({ code: actor.getError(), response, meta });
    const input = listQuerySchema.safeParse(query);
    if (!input.success) throw createValidationException([]);
    if (!this.dependencies)
      return conversationFailure({
        code: CommonErrorCode.DependencyUnavailable,
        response,
        meta,
      });
    const result = await listUnreadConversations(
      { actor: actor.get(), limit: input.data.limit },
      this.dependencies,
    );
    if (result.isError())
      return conversationFailure({ code: result.getError(), response, meta });
    return { ok: true, data: result.get(), meta };
  }
}
