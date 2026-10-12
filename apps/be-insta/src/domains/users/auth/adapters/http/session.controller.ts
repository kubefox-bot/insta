import type { ClientSourceReader } from "@insta/contracts/http";
import { httpHeaderNames } from "@insta/contracts/http";
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import { z } from "zod";
import type {
  NativeResponse,
  SwaggerBodySchema,
} from "../../../../../lib/http/index";
import {
  clientSourceToken,
  createValidationException,
  readCorrelation,
} from "../../../../../lib/http/index";
import { PasswordAdmissionError } from "../../../domain/password-admission";
import type { SessionId } from "../../../domain/types";
import { authAdmissionReply } from "../../../http/admission";
import { admitAuthMutation } from "../../../use-cases/admit-mutation";
import { login } from "../../use-cases/login";
import { refresh } from "../../use-cases/refresh";
import { revokeSession } from "../../use-cases/revoke-session";
import { authDependenciesToken, idempotencyHeader } from "./conts";
import { authFailure } from "./reply";
import {
  authFailureSchema,
  idempotencySchema,
  loginSchema,
  loginSuccessSchema,
  meSuccessSchema,
  refreshSchema,
  refreshSuccessSchema,
  revokeSchema,
  terminalSuccessSchema,
} from "./session.dto";
import { authorizeBearer } from "./session.guard";
import type { AuthHttpDependencies, NativeRequest } from "./types";
@Controller("v1")
@ApiResponse({ status: 400, standardSchema: authFailureSchema })
@ApiResponse({ status: 401, standardSchema: authFailureSchema })
@ApiResponse({ status: 409, standardSchema: authFailureSchema })
@ApiResponse({ status: 429, standardSchema: authFailureSchema })
@ApiResponse({ status: 503, standardSchema: authFailureSchema })
@ApiResponse({ status: 500, standardSchema: authFailureSchema })
export class SessionController {
  /**
   * Принимает auth-порты и доверенный reader источника запроса; инфраструктурные клиенты
   * остаются во владении composition.
   */
  constructor(
    @Inject(authDependenciesToken)
    private readonly dependencies: AuthHttpDependencies,
    @Inject(clientSourceToken)
    private readonly clientSource: ClientSourceReader,
  ) {}
  /**
   * Ограничивает попытки входа по email и источнику, запускает login и возвращает
   * credentials с operationId; password-перегрузка получает Retry-After.
   */
  @Post("auth/login")
  @ApiOperation({ operationId: "login" })
  @ApiBody({ schema: z.toJSONSchema(loginSchema) as SwaggerBodySchema })
  @ApiResponse({ status: 200, standardSchema: loginSuccessSchema })
  async login(
    @Body({ schema: loginSchema }) input: z.infer<typeof loginSchema>,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Req() request: NativeRequest,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const source = this.clientSource({
      headers,
      peer: request.socket.remoteAddress ?? "unknown",
      method: request.method,
      pathname: request.path,
    });
    const admission = await admitAuthMutation(
      { mutation: "login", email: input.email, source },
      this.dependencies,
    );
    if (admission.isError()) {
      const reply = authAdmissionReply({ failure: admission.getError(), meta });
      response.status(reply.status);
      response.setHeader("Retry-After", reply.headers["Retry-After"]);
      return reply.body;
    }
    try {
      const result = await login(
        { ...input, operationId: this.dependencies.operationId() },
        this.dependencies,
      );
      if (result.isError())
        return authFailure({ code: result.getError(), response, meta });
      response.status(HttpStatus.OK);
      return {
        ok: true,
        data: result.get().credentials,
        meta: { ...meta, operationId: result.get().operationId },
      };
    } catch (error) {
      if (!(error instanceof PasswordAdmissionError)) throw error;
      const reply = authAdmissionReply({ failure: error, meta });
      response.status(reply.status);
      response.setHeader("Retry-After", reply.headers["Retry-After"]);
      return reply.body;
    }
  }
  /**
   * Проверяет необязательный idempotency key и адаптирует refresh/replay к no-store
   * HTTP-ответу с исходным operationId.
   */
  @Post("auth/refresh")
  @ApiOperation({ operationId: "refresh" })
  @ApiHeader({
    name: httpHeaderNames.idempotencyKey,
    required: false,
    schema: z.toJSONSchema(idempotencySchema.unwrap()) as SwaggerBodySchema,
  })
  @ApiBody({ schema: z.toJSONSchema(refreshSchema) as SwaggerBodySchema })
  @ApiResponse({ status: 200, standardSchema: refreshSuccessSchema })
  async refresh(
    @Body({ schema: refreshSchema }) input: z.infer<typeof refreshSchema>,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const key = idempotencySchema.safeParse(headers[idempotencyHeader]);
    if (!key.success) throw createValidationException([]);
    const result = await refresh(
      {
        ...input,
        ...(key.data ? { idempotencyKey: key.data } : {}),
        operationId: this.dependencies.operationId(),
      },
      this.dependencies,
    );
    if (result.isError())
      return authFailure({ code: result.getError(), response, meta });
    response.status(HttpStatus.OK);
    return {
      ok: true,
      data: result.get().credentials,
      meta: { ...meta, operationId: result.get().operationId },
    };
  }
  /**
   * Принимает revoke secret и проверенный idempotency header; возвращает терминальное
   * состояние с operationId, если он есть.
   */
  @Post("auth/sessions/revoke")
  @ApiOperation({ operationId: "revokeSession" })
  @ApiHeader({
    name: httpHeaderNames.idempotencyKey,
    required: false,
    schema: z.toJSONSchema(idempotencySchema.unwrap()) as SwaggerBodySchema,
  })
  @ApiBody({ schema: z.toJSONSchema(revokeSchema) as SwaggerBodySchema })
  @ApiResponse({ status: 200, standardSchema: terminalSuccessSchema })
  async revoke(
    @Body({ schema: revokeSchema }) input: z.infer<typeof revokeSchema>,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const key = idempotencySchema.safeParse(headers[idempotencyHeader]);
    if (!key.success) throw createValidationException([]);
    const result = await revokeSession(
      {
        ...input,
        backendSessionId: input.backendSessionId as SessionId,
        ...(key.data ? { idempotencyKey: key.data } : {}),
      },
      this.dependencies,
    );
    if (result.isError())
      return authFailure({ code: result.getError(), response, meta });
    response.status(HttpStatus.OK);
    return {
      ok: true,
      data: { state: result.get().state },
      meta: {
        ...meta,
        ...(result.get().operationId
          ? { operationId: result.get().operationId }
          : {}),
      },
    };
  }
  /**
   * Авторизует bearer по канонической сессии и отдаёт только публичные id и username
   * текущего пользователя.
   */
  @ApiBearerAuth()
  @Get("me")
  @ApiOperation({ operationId: "getMe" })
  @ApiResponse({ status: 200, standardSchema: meSuccessSchema })
  async me(
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const result = await authorizeBearer(headers, this.dependencies);
    if (result.isError())
      return authFailure({ code: result.getError(), response, meta });
    return {
      ok: true,
      data: { id: result.get().userId, username: result.get().username },
      meta,
    };
  }
}
