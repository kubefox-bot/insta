import "reflect-metadata";
import { readCorrelation } from "@insta/contracts/http";
import { Controller, Get, Module, Res } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  ExpressAdapter,
  type NestExpressApplication,
} from "@nestjs/platform-express";
import { authAdmissionReply } from "../../../src/domains/users/http/index";
import { PasswordAdmissionError } from "../../../src/domains/users/index";
export const createAdmissionHttpFixture = async (
  operation: () => Promise<void>,
) => {
  class CapacityController {
    async read(
      response: Readonly<{
        setHeader: (key: string, value: string) => void;
        status: (value: number) => { json: (body: unknown) => void };
      }>,
    ) {
      try {
        await operation();
        throw new Error("Unexpected admitted test effect");
      } catch (error) {
        if (!(error instanceof PasswordAdmissionError)) throw error;
        const reply = authAdmissionReply({
          failure: error,
          meta: readCorrelation({}),
        });
        response.setHeader("Retry-After", reply.headers["Retry-After"]);
        response.status(reply.status).json(reply.body);
      }
    }
  }
  Controller("admission")(CapacityController);
  const descriptor = Object.getOwnPropertyDescriptor(
    CapacityController.prototype,
    "read",
  );
  if (!descriptor) throw new Error("Missing test handler");
  Get()(CapacityController.prototype, "read", descriptor);
  Res()(CapacityController.prototype, "read", 0);
  class TestModule {}
  Module({ controllers: [CapacityController] })(TestModule);
  const app = await NestFactory.create<NestExpressApplication>(
    TestModule,
    new ExpressAdapter(),
    { logger: false, abortOnError: false },
  );
  await app.listen(0, "127.0.0.1");
  return { url: `${await app.getUrl()}/admission`, close: () => app.close() };
};
