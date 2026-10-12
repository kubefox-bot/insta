import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { z } from "zod";
import { apiTitle, apiVersion, openApiVersion } from "./conts";

/** Строит OpenAPI из зарегистрированных Nest transport DTO, используя Zod как источник JSON Schema. */
export const createOpenApiDocument = (app: INestApplication) =>
  SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(apiTitle)
      .addBearerAuth()
      .setVersion(apiVersion)
      .setOpenAPIVersion(openApiVersion)
      .build(),
    {
      /** Преобразует только распознанную Zod-схему в draft-2020-12; остальные standard schemas оставляет без преобразования. */
      standardSchemaConverter: (schema) =>
        schema instanceof z.ZodType
          ? { schema: z.toJSONSchema(schema, { target: "draft-2020-12" }) }
          : undefined,
    },
  );
