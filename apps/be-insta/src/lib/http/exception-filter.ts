import { CommonErrorCode } from "@insta/contracts/errors";
import { validationErrorSchema } from "@insta/contracts/http";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { z } from "zod";
import { readCorrelation } from "./correlation";

const bodyTooLarge = z.object({
  type: z.literal("entity.too.large"),
  status: z.literal(HttpStatus.PAYLOAD_TOO_LARGE),
});
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  /** Переводит исключение в HTTP envelope с корреляцией; внутренние ошибки и исходные данные не раскрываются клиенту. */
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<{ headers: Record<string, unknown> }>();
    const response = http.getResponse<{
      status: (status: number) => { json: (body: unknown) => void };
    }>();
    const meta = readCorrelation(request.headers);
    const providerStatus = bodyTooLarge.safeParse(exception).success
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : providerStatus;
    const parsed = validationErrorSchema.safeParse(
      exception instanceof HttpException ? exception.getResponse() : undefined,
    );
    const error =
      status === HttpStatus.BAD_REQUEST && parsed.success
        ? parsed.data
        : { code: CommonErrorCode.InternalError, message: "Request failed" };
    response.status(status).json({ ok: false, error, meta });
  }
}
