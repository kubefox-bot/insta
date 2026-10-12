import { CommonErrorCode, ReceiptErrorCode } from "@insta/contracts/errors";
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
  ApiOperation,
  ApiParam,
  ApiResponse,
} from "@nestjs/swagger";
import { z } from "zod";
import {
  createValidationException,
  type NativeResponse,
  readCorrelation,
  type SwaggerBodySchema,
} from "../../../../../lib/http/index";
import {
  authDependenciesToken,
  authFailure,
  authFailureSchema,
  authorizeBearer,
} from "../../../../users/http/server";
import type { AuthDependencies } from "../../../../users/index";
import type { ReceiptDependencies } from "../../../ports/receipts";
import { acknowledgeReceipts } from "../../../use-cases/receipts/acknowledge";
import { mapReceiptSnapshot } from "../../receipts/map";
import {
  conversationErrorStatus as receiptErrorStatus,
  retryAfterSeconds,
} from "../conts";
import { identifierSchema } from "../conversations/dto";
import { receiptsDependenciesToken } from "./conts";
import {
  receiptFailureSchema,
  receiptInputSchema,
  receiptSuccessSchema,
} from "./dto";
@Controller("v1/conversations")
@ApiBearerAuth()
@ApiResponse({ status: 401, standardSchema: authFailureSchema })
@ApiResponse({ status: 400, standardSchema: receiptFailureSchema })
@ApiResponse({ status: 403, standardSchema: receiptFailureSchema })
@ApiResponse({ status: 404, standardSchema: receiptFailureSchema })
@ApiResponse({ status: 429, standardSchema: receiptFailureSchema })
@ApiResponse({ status: 503, standardSchema: receiptFailureSchema })
export class ReceiptController {
  /**
   * Получает auth и необязательные receipt-порты, оставляя транзакции и lifecycle
   * владельцам адаптеров.
   */
  constructor(
    @Inject(authDependenciesToken) private readonly auth: AuthDependencies,
    @Inject(receiptsDependenciesToken)
    private readonly dependencies: ReceiptDependencies | null,
  ) {}
  /**
   * Проверяет actor, conversationId и receipt payload; передаёт подтверждение use case и
   * возвращает wire snapshot, сохраняя rate-limit Retry-After.
   */
  @Post(":id/receipts")
  @ApiOperation({ operationId: "acknowledgeReceipts" })
  @ApiParam({
    name: "id",
    schema: { type: "string", pattern: "^[a-f0-9]{24}$" },
  })
  @ApiBody({ schema: z.toJSONSchema(receiptInputSchema) as SwaggerBodySchema })
  @ApiResponse({ status: 200, standardSchema: receiptSuccessSchema })
  async acknowledge(
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
    const input = receiptInputSchema.safeParse(body);
    if (!input.success || !identifierSchema.safeParse(conversationId).success)
      throw createValidationException([]);
    if (!this.dependencies) {
      response.status(receiptErrorStatus.DEPENDENCY_UNAVAILABLE);
      return {
        ok: false,
        error: {
          code: CommonErrorCode.DependencyUnavailable,
          message: "Receipt request failed",
        },
        meta,
      };
    }
    const result = await acknowledgeReceipts(
      { actorId: actor.get().userId, conversationId, ...input.data },
      this.dependencies,
    );
    if (result.isError()) {
      const code = result.getError();
      response.status(receiptErrorStatus[code]);
      if (code === ReceiptErrorCode.ReceiptsRateLimited)
        response.setHeader("Retry-After", String(retryAfterSeconds));
      return {
        ok: false,
        error: { code, message: "Receipt request failed" },
        meta,
      };
    }
    response.status(HttpStatus.OK);
    return { ok: true, data: mapReceiptSnapshot(result.get()), meta };
  }
}
