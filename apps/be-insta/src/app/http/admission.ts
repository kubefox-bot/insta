import { CommonErrorCode } from "@insta/contracts/errors";
import { requestLimits } from "@insta/contracts/http";
import { HttpStatus } from "@nestjs/common";
import { readCorrelation } from "../../lib/http/index";
import { isDocumentationPath } from "../docs/index";
import type { Readiness } from "../health/readiness/index";
import { headersTooLargeStatus } from "./conts";
// This transport boundary rejects dependency failure before future HTTP/WS handlers.
/** Проверяет размер заголовков и обязательную readiness до бизнес-маршрутов; health и docs остаются доступны для диагностики. */
export const createAdmission =
  (readiness: Pick<Readiness, "checkRequired">) =>
  async (
    request: {
      readonly path: string;
      readonly headers: Readonly<Record<string, string | string[] | undefined>>;
    },
    response: { status: (status: number) => { json: (body: unknown) => void } },
    next: () => void,
  ) => {
    const headerBytes = Object.entries(request.headers).reduce(
      (total, [key, value]) =>
        total + Buffer.byteLength(`${key}: ${value ?? ""}\r\n`),
      0,
    );
    if (headerBytes > requestLimits.headerBytes) {
      response.status(headersTooLargeStatus).json({
        ok: false,
        error: {
          code: "HEADERS_TOO_LARGE",
          message: "Request headers exceed limit",
        },
        meta: readCorrelation(request.headers),
      });
      return;
    }
    if (
      request.path === "/health/live" ||
      request.path === "/health/ready" ||
      isDocumentationPath(request.path)
    ) {
      next();
      return;
    }
    if (!(await readiness.checkRequired())) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        ok: false,
        error: {
          code: CommonErrorCode.DependencyUnavailable,
          message: "Required dependency unavailable",
        },
        meta: readCorrelation(request.headers),
      });
      return;
    }
    next();
  };
