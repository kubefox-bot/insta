import type { IncomingMessage } from "node:http";
import { CommonErrorCode } from "@insta/contracts/errors";
import type { ClientSourceReader } from "@insta/contracts/http";
import { httpHeaderNames, httpHeaders } from "@insta/contracts/http";
import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import {
  clientSourceToken,
  createValidationException,
  type NativeResponse,
  readCorrelation,
} from "../../../../lib/http/index";
import {
  authDependenciesToken,
  authFailure,
  authorizeBearer,
} from "../../../users/http/server";
import type { AuthDependencies } from "../../../users/index";
import { feedPolicy } from "../../domain/feed/conts";
import type { StoryDependencies } from "../../ports/persistence/interfaces";
import { playbackStory } from "../../use-cases/playback";
import type { createStoryPublisherLifetime } from "../../use-cases/publisher";
import { readPublication } from "../../use-cases/read-publication";
import { admitStoryRead, readUnavailable } from "./admission";
import {
  storiesDependenciesToken,
  storyErrorStatus,
  storyReadsToken,
} from "./conts";
import {
  feedQuerySchema,
  feedSuccessSchema,
  operationSchema,
  playbackSuccessSchema,
  publicationSuccessSchema,
  publishSuccessSchema,
  storyFailureSchema,
} from "./story.dto";
import type {
  StoryNativeRequest,
  StoryReadDependencies,
  StoryResponse,
} from "./types";
import { createStoryUpload } from "./upload";
@Controller("v1/stories")
@ApiResponse({ status: 400, standardSchema: storyFailureSchema })
@ApiResponse({ status: 401, standardSchema: storyFailureSchema })
@ApiResponse({ status: 409, standardSchema: storyFailureSchema })
@ApiResponse({ status: 413, standardSchema: storyFailureSchema })
@ApiResponse({ status: 422, standardSchema: storyFailureSchema })
@ApiResponse({
  status: 503,
  standardSchema: storyFailureSchema,
  headers: {
    "Retry-After": {
      description: "Retry delay in seconds",
      schema: { type: "integer" },
    },
  },
})
export class StoryController {
  /**
   * Принимает auth, опциональные Stories-порты и доверенный source reader; отсутствие
   * Stories сохраняет Core-профиль без capability.
   */
  constructor(
    @Inject(authDependenciesToken) private readonly auth: AuthDependencies,
    @Inject(storiesDependenciesToken)
    private readonly dependencies:
      | (StoryDependencies &
          Pick<ReturnType<typeof createStoryPublisherLifetime>, "publish">)
      | null,
    @Inject(storyReadsToken)
    private readonly reads: StoryReadDependencies | null,
    @Inject(clientSourceToken) private readonly source: ClientSourceReader,
  ) {}
  /**
   * Авторизует upload и проверяет ключ операции до чтения multipart; связывает обрыв HTTP
   * с отменой публикации. Возвращает operation id и снимает listeners в finally.
   */
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ operationId: "publishStory" })
  @ApiConsumes("multipart/form-data")
  @ApiHeader({
    name: httpHeaderNames.idempotencyKey,
    required: false,
    schema: { type: "string", maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" },
  })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["video"],
      properties: { video: { type: "string", format: "binary" } },
    },
  })
  @ApiResponse({ status: 200, standardSchema: publishSuccessSchema })
  async publish(
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: StoryResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const actor = await authorizeBearer(headers, this.auth);
    if (actor.isError())
      return authFailure({ code: actor.getError(), response, meta });
    const key = operationSchema
      .optional()
      .safeParse(headers[httpHeaders.idempotencyKey]);
    if (!key.success) throw createValidationException([]);
    if (!this.dependencies) return this.unavailable(response, meta);
    const operationId = key.data ?? this.dependencies.uuid();
    const cancellation = new AbortController();
    /**
     * Передаёт обрыв запроса общему сигналу публикации, оставляя durable разрешение
     * исхода use case.
     */
    const abort = () => cancellation.abort();
    /**
     * Отменяет публикацию только при закрытии ответа до writableFinished, не считая
     * нормальное завершение обрывом.
     */
    const closed = () => {
      if (!response.writableFinished) abort();
    };
    response.once("close", closed);
    request.once("aborted", abort);
    try {
      const result = await this.dependencies.publish({
        actor: actor.get(),
        operationId,
        file: createStoryUpload({
          request,
          contentType: request.headers["content-type"],
        }),
        signal: cancellation.signal,
      });
      const metadata = { ...meta, operationId };
      if (result.isError()) {
        const code = result.getError();
        response.status(storyErrorStatus[code]);
        if (storyErrorStatus[code] === HttpStatus.SERVICE_UNAVAILABLE)
          response.setHeader(
            "Retry-After",
            String(feedPolicy.retryAfterSeconds),
          );
        return { ok: false, error: { code, message: code }, meta: metadata };
      }
      response.status(HttpStatus.OK);
      return { ok: true, data: result.get(), meta: metadata };
    } finally {
      request.removeListener("aborted", abort);
      response.removeListener("close", closed);
    }
  }
  /**
   * После авторизации и проверки operation id возвращает durable исход только текущего
   * автора, запрещая кэширование ответа.
   */
  @Get("publications/:operationId")
  @ApiBearerAuth()
  @ApiOperation({ operationId: "readStoryPublication" })
  @ApiParam({
    name: "operationId",
    schema: { type: "string", pattern: "^[A-Za-z0-9_-]+$", maxLength: 128 },
  })
  @ApiResponse({ status: 200, standardSchema: publicationSuccessSchema })
  async publication(
    @Param("operationId") operationId: string,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const actor = await authorizeBearer(headers, this.auth);
    if (actor.isError())
      return authFailure({ code: actor.getError(), response, meta });
    if (!operationSchema.safeParse(operationId).success)
      throw createValidationException([]);
    if (!this.dependencies) return this.unavailable(response, meta);
    return {
      ok: true,
      data: await readPublication(
        { actor: actor.get(), operationId },
        this.dependencies,
      ),
      meta,
    };
  }
  /**
   * Проверяет query и квоту источника, затем выдаёт публичную ленту без HTTP-кэширования;
   * invalid cursor отличает от временной недоступности.
   */
  @Get()
  @ApiOperation({ operationId: "storyFeed" })
  @ApiQuery({
    name: "cursor",
    required: false,
    schema: { type: "string", maxLength: feedPolicy.cursorBytes },
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: feedPolicy.authorsPerPage },
  })
  @ApiResponse({ status: 200, standardSchema: feedSuccessSchema })
  async feed(
    @Query() query: Readonly<Record<string, unknown>>,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Req() request: StoryNativeRequest,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const parsed = feedQuerySchema.safeParse(query);
    if (!parsed.success) throw createValidationException([]);
    if (
      !this.reads ||
      !(await admitStoryRead({
        operation: "feed",
        headers,
        request,
        source: this.source,
        reads: this.reads,
      }))
    )
      return readUnavailable({ response, meta });
    const result = await this.reads.feed({ ...parsed.data, now: Date.now() });
    if (result.isError()) {
      if (result.getError() === CommonErrorCode.InvalidCursor)
        throw createValidationException([]);
      return readUnavailable({ response, meta, code: result.getError() });
    }
    return { ok: true, data: result.get(), meta };
  }
  /**
   * Применяет квоту чтения и выдаёт подписанный playback URL; истёкшую или отсутствующую
   * историю отображает в 404, сбой зависимости — в 503.
   */
  @Get(":id/playback")
  @ApiOperation({ operationId: "storyPlayback" })
  @ApiParam({ name: "id", schema: { type: "string", format: "uuid" } })
  @ApiResponse({ status: 200, standardSchema: playbackSuccessSchema })
  @ApiResponse({ status: 404, standardSchema: storyFailureSchema })
  async playback(
    @Param("id") id: string,
    @Req() request: StoryNativeRequest,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    if (!this.dependencies) return this.unavailable(response, meta);
    if (
      !this.reads ||
      !(await admitStoryRead({
        operation: "playback",
        headers,
        request,
        source: this.source,
        reads: this.reads,
      }))
    )
      return readUnavailable({ response, meta });
    const result = await playbackStory(id, this.dependencies);
    if (result.isError()) {
      if (result.getError() === CommonErrorCode.DependencyUnavailable)
        return readUnavailable({ response, meta });
      response.status(HttpStatus.NOT_FOUND);
      return {
        ok: false,
        error: { code: result.getError(), message: result.getError() },
        meta,
      };
    }
    return { ok: true, data: result.get(), meta };
  }
  /**
   * Формирует ответ отключённой/недоступной Stories capability с 503 и Retry-After,
   * сохраняя корреляцию запроса.
   */
  private unavailable(
    response: NativeResponse,
    meta: ReturnType<typeof readCorrelation>,
  ) {
    response.setHeader("Retry-After", String(feedPolicy.retryAfterSeconds));
    response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      ok: false,
      error: {
        code: CommonErrorCode.DependencyUnavailable,
        message: "Stories unavailable",
      },
      meta,
    };
  }
}
