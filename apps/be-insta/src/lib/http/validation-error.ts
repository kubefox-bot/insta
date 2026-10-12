import { CommonErrorCode } from "@insta/contracts/errors";
import { validationErrorSchema } from "@insta/contracts/http";
import {
  BadRequestException,
  type StandardSchemaValidationPipeOptions,
} from "@nestjs/common";
/** Создаёт безопасный ответ валидации: сохраняет пути полей, но заменяет исходные сообщения общей ошибкой. */
export const createValidationException = (
  issues: Parameters<
    NonNullable<StandardSchemaValidationPipeOptions["exceptionFactory"]>
  >[0],
) =>
  new BadRequestException(
    validationErrorSchema.parse({
      code: CommonErrorCode.ValidationFailed,
      message: "Request validation failed",
      details: {
        issues: issues.map((issue) => ({
          path: (issue.path ?? []).map((segment) => {
            const key = typeof segment === "object" ? segment.key : segment;
            return typeof key === "number" ? key : String(key);
          }),
          code: "INVALID_VALUE",
          message: "Invalid value",
        })),
      },
    }),
  );
