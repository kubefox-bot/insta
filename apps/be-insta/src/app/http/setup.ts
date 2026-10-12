import { consentPayloadBytes } from "@insta/contracts/privacy";
import { StandardSchemaValidationPipe } from "@nestjs/common";
import {
  ExpressAdapter,
  type NestExpressApplication,
} from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";
import type { PrivacyDependencies } from "../../domains/privacy/index";
import {
  createValidationException,
  HttpExceptionFilter,
} from "../../lib/http/index";
import {
  createHttpContext,
  type RuntimeObservability,
} from "../../lib/observability/index";
import type { Readiness } from "../health/readiness/index";
import { createAdmission } from "./admission";
import { createAnalyticsContext } from "./analytics-context";
import { installJsonBodyParser } from "./json-body";
/** Связывает admission, consent context, body parsing, schema validation и безопасный exception filter в заданном порядке. */
export const configureHttp = ({
  app,
  readiness,
  privacy,
  observability,
}: Readonly<{
  app: NestExpressApplication;
  readiness: Readiness;
  privacy: PrivacyDependencies | undefined;
  observability: RuntimeObservability | undefined;
}>) => {
  app.useLogger(observability ? app.get(Logger) : false);
  if (observability) app.use(createHttpContext(observability));
  app.use(createAdmission(readiness));
  app.use(createAnalyticsContext(privacy));
  const privacyParser = new ExpressAdapter();
  privacyParser.useBodyParser("json", false, { limit: consentPayloadBytes });
  app.use("/v1/privacy/preferences", privacyParser.getInstance());
  installJsonBodyParser(app);
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: createValidationException,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
};
