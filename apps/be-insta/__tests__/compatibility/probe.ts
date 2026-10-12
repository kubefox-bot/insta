import "reflect-metadata";
import {
  Body,
  Controller,
  Inject,
  Module,
  Post,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiOperation,
  DocumentBuilder,
  SwaggerModule,
} from "@nestjs/swagger";
import { z } from "zod";

const providerToken = Symbol("compatibility-provider");
const schema = z.object({ name: z.string().min(1) });
// Zod's generic JSON Schema type includes boolean schemas. This fixture accepts
// only its concrete OpenAPI object/string subset before crossing Swagger's API.
const requestSchema = z
  .object({
    type: z.literal("object"),
    properties: z.record(
      z.string(),
      z.object({ type: z.literal("string"), minLength: z.number().int() }),
    ),
    required: z.array(z.string()),
  })
  .parse(z.toJSONSchema(schema, { target: "openapi-3.0" }));
const acceptedNames: string[] = [];

@Controller("compatibility")
class ProbeController {
  constructor(@Inject(providerToken) private readonly marker: string) {}

  @Post()
  @ApiOperation({ operationId: "createCompatibilityProbe" })
  @ApiBody({ schema: requestSchema })
  create(@Body({ schema }) input: z.infer<typeof schema>) {
    acceptedNames.push(input.name);
    return { providerResolved: this.marker === "resolved", name: input.name };
  }
}

@Module({
  controllers: [ProbeController],
  providers: [{ provide: providerToken, useValue: "resolved" }],
})
class ProbeModule {}

const app = await NestFactory.create(ProbeModule, new ExpressAdapter(), {
  logger: false,
});
app.useGlobalPipes(new StandardSchemaValidationPipe());
try {
  await app.listen(0, "127.0.0.1");
  const url = `${await app.getUrl()}/compatibility`;
  const invalid = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: 42 }),
  });
  const valid = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "fixture" }),
  });
  const payload = await valid.json();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle("Compatibility").setVersion("1").build(),
  );
  const media = document.paths["/compatibility"]?.post?.requestBody;
  const bodySchema =
    media && "content" in media
      ? media.content["application/json"]?.schema
      : undefined;
  if (!bodySchema || "$ref" in bodySchema)
    throw new Error("Concrete DTO schema is missing");
  console.log(
    JSON.stringify({
      providerResolved: payload.providerResolved,
      validationStatus: invalid.status,
      validStatus: valid.status,
      invalidPayloadReachedHandler:
        acceptedNames.length !== 1 || acceptedNames[0] !== "fixture",
      openApiPropertyType:
        bodySchema.properties?.name && "type" in bodySchema.properties.name
          ? bodySchema.properties.name.type
          : undefined,
      openApiRequired: bodySchema.required,
      openApiDocument: document,
    }),
  );
} finally {
  await app.close();
}
