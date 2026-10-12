import { RegistrationErrorCode } from "@insta/contracts/errors";
import type { ClientSourceReader } from "@insta/contracts/http";
import { httpHeaderNames } from "@insta/contracts/http";
import {
  Body,
  Controller,
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
} from "../../../../../lib/http/index";
import {
  clientSourceToken,
  createValidationException,
  readCorrelation,
} from "../../../../../lib/http/index";
import { PasswordAdmissionError } from "../../../domain/password-admission";
import { authAdmissionReply } from "../../../http/admission";
import type { AuthLimits } from "../../../ports/auth-limits";
import { admitAuthMutation } from "../../../use-cases/admit-mutation";
import type { RegistrationDependencies } from "../../ports/registration/dependencies";
import { completeRegistration } from "../../use-cases/complete-registration";
import { requestCode } from "../../use-cases/request-code";
import { verifyCode } from "../../use-cases/verify-code";
import { idempotencyHeader, registrationDependenciesToken } from "./conts";
import {
  registrationCompleteSchema,
  registrationFailureSchema,
  registrationStartSchema,
  registrationStartSuccessSchema,
  registrationVerifySchema,
  registrationVerifySuccessSchema,
} from "./registration.dto";
import { registrationFailure } from "./registration-reply";
import { idempotencySchema, loginSuccessSchema } from "./session.dto";
import type { NativeRequest } from "./types";
@Controller("v1/auth/registration")
@ApiResponse({ status: 400, standardSchema: registrationFailureSchema })
@ApiResponse({ status: 401, standardSchema: registrationFailureSchema })
@ApiResponse({ status: 409, standardSchema: registrationFailureSchema })
@ApiResponse({ status: 429, standardSchema: registrationFailureSchema })
@ApiResponse({ status: 503, standardSchema: registrationFailureSchema })
@ApiResponse({ status: 500, standardSchema: registrationFailureSchema })
export class RegistrationController {
  /**
   * Принимает регистрацию и определение источника от Nest composition; null dependencies
   * означает недоступность регистрации.
   */
  constructor(
    @Inject(registrationDependenciesToken)
    private readonly dependencies:
      | (RegistrationDependencies & Readonly<{ limits: AuthLimits }>)
      | null,
    @Inject(clientSourceToken)
    private readonly clientSource: ClientSourceReader,
  ) {}
  /**
   * Применяет лимиты email/источника перед постановкой OTP-письма; отдаёт no-store и
   * Retry-After при admission-отказе.
   */
  @Post("start")
  @ApiOperation({ operationId: "startRegistration" })
  @ApiBody({
    schema: z.toJSONSchema(registrationStartSchema) as SwaggerBodySchema,
  })
  @ApiResponse({ status: 200, standardSchema: registrationStartSuccessSchema })
  async start(
    @Body({ schema: registrationStartSchema }) input: z.infer<
      typeof registrationStartSchema
    >,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Req() request: NativeRequest,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    if (!this.dependencies)
      return registrationFailure({
        code: RegistrationErrorCode.RegistrationUnavailable,
        response,
        meta,
      });
    const source = this.clientSource({
      headers,
      peer: request.socket.remoteAddress ?? "unknown",
      method: request.method,
      pathname: request.path,
    });
    const admission = await admitAuthMutation(
      { mutation: "otp", email: input.email, source },
      this.dependencies,
    );
    if (admission.isError()) {
      const reply = authAdmissionReply({ failure: admission.getError(), meta });
      response.status(reply.status);
      response.setHeader("Retry-After", reply.headers["Retry-After"]);
      return reply.body;
    }
    const result = await requestCode(input, this.dependencies);
    if (result.isError())
      return registrationFailure({ code: result.getError(), response, meta });
    response.status(HttpStatus.OK);
    return {
      ok: true,
      data: result.get(),
      meta: { ...meta, operationId: input.operationId },
    };
  }
  /**
   * Передаёт проверенный HTTP-ввод сценарию OTP verification и переводит ожидаемые отказы
   * в статусы регистрации без кэширования ответа.
   */
  @Post("verify")
  @ApiOperation({ operationId: "verifyRegistration" })
  @ApiBody({
    schema: z.toJSONSchema(registrationVerifySchema) as SwaggerBodySchema,
  })
  @ApiResponse({ status: 200, standardSchema: registrationVerifySuccessSchema })
  async verify(
    @Body({ schema: registrationVerifySchema }) input: z.infer<
      typeof registrationVerifySchema
    >,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    if (!this.dependencies)
      return registrationFailure({
        code: RegistrationErrorCode.RegistrationUnavailable,
        response,
        meta,
      });
    const result = await verifyCode(input, this.dependencies);
    if (result.isError())
      return registrationFailure({ code: result.getError(), response, meta });
    response.status(HttpStatus.OK);
    return { ok: true, data: result.get(), meta };
  }
  /**
   * Проверяет idempotency header и завершает регистрацию с credentials; отдельно
   * преобразует перегрузку password-вычислений в admission-ответ.
   */
  @Post("complete")
  @ApiOperation({ operationId: "completeRegistration" })
  @ApiHeader({
    name: httpHeaderNames.idempotencyKey,
    required: false,
    schema: z.toJSONSchema(idempotencySchema.unwrap()) as SwaggerBodySchema,
  })
  @ApiBody({
    schema: z.toJSONSchema(registrationCompleteSchema) as SwaggerBodySchema,
  })
  @ApiResponse({ status: 200, standardSchema: loginSuccessSchema })
  async complete(
    @Body({ schema: registrationCompleteSchema }) input: z.infer<
      typeof registrationCompleteSchema
    >,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const key = idempotencySchema.safeParse(headers[idempotencyHeader]);
    if (!key.success) throw createValidationException([]);
    if (!this.dependencies)
      return registrationFailure({
        code: RegistrationErrorCode.RegistrationUnavailable,
        response,
        meta,
      });
    try {
      const result = await completeRegistration(
        { ...input, ...(key.data ? { idempotencyKey: key.data } : {}) },
        this.dependencies,
      );
      if (result.isError())
        return registrationFailure({ code: result.getError(), response, meta });
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
}
