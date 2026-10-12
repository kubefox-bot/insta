import { SupportErrorCode } from "@insta/contracts/errors";
import type { ClientSourceReader } from "@insta/contracts/http";
import { httpHeaderNames, httpHeaders } from "@insta/contracts/http";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { z } from "zod";
import type {
  NativeResponse,
  SwaggerBodySchema,
} from "../../../../lib/http/index";
import {
  clientSourceToken,
  createValidationException,
  readBearerToken,
  readCorrelation,
} from "../../../../lib/http/index";
import type { SupportDependencies } from "../../ports/dependencies";
import { issueFormContext } from "../../use-cases/issue-context";
import { submitReport } from "../../use-cases/submit";
import { supportDependenciesToken, supportStatus } from "./conts";
import {
  contextSuccessSchema,
  reportKeySchema,
  reportSchema,
  reportSuccessSchema,
  supportFailureSchema,
} from "./report.dto";
@Controller("v1/support")
@ApiResponse({ status: 400, standardSchema: supportFailureSchema })
@ApiResponse({ status: 403, standardSchema: supportFailureSchema })
@ApiResponse({ status: 409, standardSchema: supportFailureSchema })
@ApiResponse({ status: 429, standardSchema: supportFailureSchema })
@ApiResponse({ status: 503, standardSchema: supportFailureSchema })
export class SupportController {
  /**
   * Принимает опциональные порты support и доверенный источник запроса; null сохраняет
   * явный режим недоступности capability.
   */
  constructor(
    @Inject(supportDependenciesToken)
    private readonly dependencies: SupportDependencies | null,
    @Inject(clientSourceToken) private readonly source: ClientSourceReader,
  ) {}
  /**
   * Выдаёт ограниченный по частоте гостевой proof формы с no-store; отсутствие capability
   * и ошибки use case переводит в публичный HTTP-исход.
   */
  @Get("form-context")
  @ApiOperation({ operationId: "issueSupportContext" })
  @ApiResponse({ status: 200, standardSchema: contextSuccessSchema })
  async context(
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Req() request: NativeRequest,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const source = this.source({
      headers,
      peer: request.socket.remoteAddress ?? "unknown",
      method: request.method,
      pathname: request.path,
    });
    if (!this.dependencies) {
      response.status(supportStatus.SUPPORT_UNAVAILABLE);
      return {
        ok: false,
        error: {
          code: SupportErrorCode.SupportUnavailable,
          message: SupportErrorCode.SupportUnavailable,
        },
        meta,
      };
    }
    const result = await issueFormContext(source, {
      limits: { consume: this.dependencies.limits.consume },
      proof: { issue: this.dependencies.proof.issue },
      clock: this.dependencies.clock,
      uuid: this.dependencies.uuid,
    });
    if (result.isError()) {
      const code = result.getError();
      response.status(supportStatus[code]);
      return { ok: false, error: { code, message: code }, meta };
    }
    return { ok: true, data: result.get(), meta };
  }
  /**
   * Проверяет idempotency header и передаёт обращение с корреляцией; присутствующий
   * неверный Authorization не превращает пользователя в гостя. Успех 202 означает приём
   * отчёта, не отправку письма.
   */
  @Post("reports")
  @ApiOperation({ operationId: "submitSupportReport" })
  @ApiHeader({
    name: httpHeaderNames.idempotencyKey,
    required: false,
    schema: z.toJSONSchema(reportKeySchema.unwrap()) as SwaggerBodySchema,
  })
  @ApiBody({ schema: z.toJSONSchema(reportSchema) as SwaggerBodySchema })
  @ApiResponse({ status: 202, standardSchema: reportSuccessSchema })
  async submit(
    @Body({ schema: reportSchema }) input: z.infer<typeof reportSchema>,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Req() request: NativeRequest,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const key = reportKeySchema.safeParse(headers[httpHeaders.idempotencyKey]);
    if (!key.success) throw createValidationException([]);
    const meta = readCorrelation(headers);
    if (!this.dependencies) {
      response.status(supportStatus.SUPPORT_UNAVAILABLE);
      return {
        ok: false,
        error: {
          code: SupportErrorCode.SupportUnavailable,
          message: SupportErrorCode.SupportUnavailable,
        },
        meta,
      };
    }
    const source = this.source({
      headers,
      peer: request.socket.remoteAddress ?? "unknown",
      method: request.method,
      pathname: request.path,
    });
    const authorization = headers.authorization;
    const accessToken = readBearerToken({ authorization });
    const result = await submitReport(
      {
        ...input,
        ...(authorization !== undefined
          ? { accessToken: accessToken ?? "" }
          : {}),
        idempotencyKey: key.data ?? this.dependencies.uuid(),
        source,
        operationId: this.dependencies.uuid(),
      },
      this.dependencies,
    );
    if (result.isError()) {
      const code = result.getError();
      response.status(supportStatus[code]);
      return { ok: false, error: { code, message: code }, meta };
    }
    response.status(HttpStatus.ACCEPTED);
    return { ok: true, data: result.get(), meta };
  }
}
type NativeRequest = Readonly<{
  socket: Readonly<{ remoteAddress?: string }>;
  method: string;
  path: string;
}>;
