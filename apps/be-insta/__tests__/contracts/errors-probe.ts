import "reflect-metadata";
import {
  Body,
  Controller,
  Get,
  Module,
  Post,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { z } from "zod";
import {
  createValidationException,
  HttpExceptionFilter,
} from "../../src/lib/http/index";

const schema = z.strictObject({ count: z.number().int().positive() });
@Controller("fixture")
class FixtureController {
  @Post("validation")
  validate(@Body({ schema }) _input: z.infer<typeof schema>) {
    throw new Error("invalid payload must not reach handler");
  }
  @Get("fault")
  fault() {
    throw new Error("SYNTHETIC_PRIVATE_DEFECT");
  }
}
@Module({ controllers: [FixtureController] })
class FixtureModule {}
const createFixtureApplication = async () => {
  const app = await NestFactory.create(FixtureModule, new ExpressAdapter(), {
    logger: false,
  });
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: createValidationException,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  return app;
};
const app = await createFixtureApplication();
try {
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const headers = {
    "Content-Type": "application/json",
    "X-Request-ID": "ab6c77d6-fbd6-4d22-9780-84a6e284cde9",
  };
  const invalid = await fetch(`${base}/fixture/validation`, {
    method: "POST",
    headers,
    body: JSON.stringify({ count: "SYNTHETIC_SECRET_INPUT" }),
  });
  const fault = await fetch(`${base}/fixture/fault`, { headers });
  console.log(
    JSON.stringify({
      invalidStatus: invalid.status,
      invalid: await invalid.json(),
      faultStatus: fault.status,
      fault: await fault.json(),
    }),
  );
} finally {
  await app.close();
}
