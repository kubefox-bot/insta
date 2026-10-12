import type { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule } from "@nestjs/swagger";
import {
  apiTitle,
  documentationApiPath,
  documentationJsonPath,
  documentationPath,
  documentationUiOptions,
} from "./conts";
import { createOpenApiDocument } from "./document";
import { redirectDocumentationEntry } from "./entry";

/** Подключает Swagger UI и JSON документацию с публичным API path; схема создаётся из текущего приложения. */
export const installDocumentation = (app: NestExpressApplication) => {
  app.use(redirectDocumentationEntry);
  SwaggerModule.setup(
    documentationPath,
    app,
    () => ({
      ...createOpenApiDocument(app),
      servers: [{ url: documentationApiPath }],
    }),
    {
      raw: ["json"],
      jsonDocumentUrl: documentationJsonPath,
      swaggerUrl: documentationJsonPath,
      customSiteTitle: apiTitle,
      swaggerOptions: documentationUiOptions,
    },
  );
};
