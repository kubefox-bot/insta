import { requestLimits } from "@insta/contracts/http";
import {
  ExpressAdapter,
  type NestExpressApplication,
} from "@nestjs/platform-express";
import { validateJsonEncoding } from "../../lib/http/index";
import { storyPublicationPath } from "./conts";
/** Устанавливает ограниченный JSON parser с UTF-8 проверкой; Stories upload оставляет разбор своему авторизованному владельцу. */
export const installJsonBodyParser = (app: NestExpressApplication) => {
  const parser = new ExpressAdapter();
  parser.useBodyParser("json", false, {
    limit: requestLimits.jsonBytes,
    /** Отклоняет некорректную UTF-8 последовательность до JSON parsing. */
    verify: (_request: unknown, _response: unknown, buffer: Uint8Array) =>
      validateJsonEncoding(buffer),
  });
  const readJson = parser.getInstance();
  app.use(
    (
      request: Readonly<{ method: string; path: string }>,
      response: unknown,
      next: () => void,
    ) => {
      // Stories authenticates and claims its operation before parsing any body type.
      if (
        request.method === "POST" &&
        storyPublicationPath.test(request.path)
      ) {
        next();
        return;
      }
      readJson(request, response, next);
    },
  );
};
