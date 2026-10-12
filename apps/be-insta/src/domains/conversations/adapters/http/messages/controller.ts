import { CommonErrorCode, MessageErrorCode } from "@insta/contracts/errors";
import {
  httpHeaders as headerKeys,
  httpHeaderNames,
} from "@insta/contracts/http";
import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
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
import { sendMessage } from "../../../use-cases/messages/send";
import {
  messageErrorStatus,
  messagesDependenciesToken,
  retryAfterSeconds,
} from "../conts";
import { identifierSchema } from "../conversations/dto";
import { createIdempotencyHeaderSchema } from "../idempotency-metadata";
import type { MessagesDependencies } from "../types";
import { messageFailureSchema, messageSuccessSchema, sendSchema } from "./dto";

@Controller("v1/conversations")
@ApiBearerAuth()
@ApiResponse({ status: 401, standardSchema: authFailureSchema })
@ApiResponse({ status: 400, standardSchema: messageFailureSchema })
@ApiResponse({ status: 403, standardSchema: messageFailureSchema })
@ApiResponse({ status: 404, standardSchema: messageFailureSchema })
@ApiResponse({ status: 409, standardSchema: messageFailureSchema })
@ApiResponse({ status: 429, standardSchema: messageFailureSchema })
@ApiResponse({ status: 503, standardSchema: messageFailureSchema })
export class MessageController {
  /**
   * Принимает auth и необязательные message-порты от composition; не создаёт
   * инфраструктурных клиентов.
   */
  constructor(
    @Inject(authDependenciesToken) private readonly auth: AuthDependencies,
    @Inject(messagesDependenciesToken)
    private readonly dependencies: MessagesDependencies | null,
  ) {}
  /**
   * Авторизует и валидирует отправку, передаёт identity/operation metadata use case;
   * возвращает committed сообщение с ISO-датой, для quota-отказа добавляет Retry-After.
   */
  @Post(":id/messages")
  @ApiOperation({ operationId: "sendMessage" })
  @ApiParam({
    name: "id",
    schema: { type: "string", pattern: "^[a-f0-9]{24}$" },
  })
  @ApiHeader({
    name: httpHeaderNames.idempotencyKey,
    required: false,
    schema: createIdempotencyHeaderSchema(idempotencySchema),
  })
  @ApiBody({ schema: z.toJSONSchema(sendSchema) as SwaggerBodySchema })
  @ApiResponse({ status: 200, standardSchema: messageSuccessSchema })
  async send(
    @Param("id") conversationId: string,
    @Body() body: unknown,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const actor = await authorizeBearer(headers, this.auth);
    if (actor.isError())
      return authFailure({ code: actor.getError(), response, meta });
    const input = sendSchema.safeParse(body);
    const key = idempotencySchema.safeParse(headers[headerKeys.idempotencyKey]);
    if (
      !input.success ||
      !key.success ||
      !identifierSchema.safeParse(conversationId).success
    )
      throw createValidationException([]);
    if (!this.dependencies) {
      response.status(messageErrorStatus.DEPENDENCY_UNAVAILABLE);
      return {
        ok: false,
        error: {
          code: CommonErrorCode.DependencyUnavailable,
          message: "Message request failed",
        },
        meta,
      };
    }
    const result = await sendMessage(
      {
        actor: actor.get(),
        conversationId,
        text: input.data.text,
        ...(input.data.clientMessageId === undefined
          ? {}
          : { clientMessageId: input.data.clientMessageId }),
        ...(key.data === undefined ? {} : { idempotencyKey: key.data }),
        operationId: meta.operationId ?? this.dependencies.uuid(),
      },
      this.dependencies,
    );
    if (result.isError()) {
      const code = result.getError();
      response.status(messageErrorStatus[code]);
      if (code === MessageErrorCode.MessagesRateLimited)
        response.setHeader("Retry-After", String(retryAfterSeconds));
      return {
        ok: false,
        error: { code, message: "Message request failed" },
        meta,
      };
    }
    const { senderId, createdAt, ...message } = result.get();
    response.status(HttpStatus.OK);
    return {
      ok: true,
      data: {
        ...message,
        authorId: senderId,
        createdAt: new Date(createdAt).toISOString(),
      },
      meta,
    };
  }
}
