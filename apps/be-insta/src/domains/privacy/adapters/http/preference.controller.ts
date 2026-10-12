import { PrivacyErrorCode } from "@insta/contracts/errors";
import type { ClientSourceReader } from "@insta/contracts/http";
import type { SaveChoice } from "@insta/contracts/privacy";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { z } from "zod";
import type { SwaggerBodySchema } from "../../../../lib/http/index";
import { clientSourceToken, readCorrelation } from "../../../../lib/http/index";
import { publicPreference } from "../../domain/preference";
import { readPreference } from "../../use-cases/read";
import { savePreference } from "../../use-cases/save";
import { consentHeader, errorStatus, privacyDependenciesToken } from "./conts";
import {
  consentFailureSchema,
  readSuccessSchema,
  saveChoiceSchema,
  saveSuccessSchema,
} from "./preference.dto";
import type { PrivacyDependencies } from "./types";
@Controller("v1/privacy/preferences")
export class PrivacyController {
  /**
   * Принимает порты privacy и доверенный разбор источника запроса; жизненным циклом
   * клиентов владеет composition.
   */
  constructor(
    @Inject(privacyDependenciesToken)
    private readonly dependencies: PrivacyDependencies,
    @Inject(clientSourceToken)
    private readonly clientSource: ClientSourceReader,
  ) {}
  /**
   * Возвращает публичный выбор по заголовку proof с no-store и корреляцией; некорректный
   * proof приводит к безопасному выбору use case.
   */
  @ApiHeader({
    name: consentHeader,
    required: false,
    description:
      "Native proof; web BFF forwards verified HttpOnly cookie proof only",
    schema: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
  })
  @Get()
  @ApiOperation({ operationId: "getPrivacyPreference" })
  @ApiResponse({ status: 200, standardSchema: readSuccessSchema })
  async read(
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: {
      setHeader: (key: string, value: string) => unknown;
    },
  ) {
    response.setHeader("Cache-Control", "no-store");
    const proof = headers[consentHeader];
    return {
      ok: true,
      data: await readPreference(
        { contextProof: typeof proof === "string" ? proof : undefined },
        this.dependencies,
      ),
      meta: readCorrelation(headers),
    };
  }
  /**
   * Проверяет форму заголовка proof, передаёт источник для ограничения частоты и
   * отображает исход сохранения в HTTP. Успех возвращает proof и срок контекста с
   * запретом кэширования.
   */
  @ApiHeader({
    name: consentHeader,
    required: false,
    description:
      "Existing native context proof; absent proof creates a new context",
    schema: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
  })
  @Post()
  // Zod uses full JSON Schema; Swagger accepts its OpenAPI-compatible object subset here.
  @ApiBody({ schema: z.toJSONSchema(saveChoiceSchema) as SwaggerBodySchema })
  @ApiOperation({ operationId: "savePrivacyPreference" })
  @ApiResponse({ status: 200, standardSchema: saveSuccessSchema })
  @ApiResponse({ status: 413, standardSchema: consentFailureSchema })
  @ApiResponse({ status: 500, standardSchema: consentFailureSchema })
  @ApiResponse({ status: 400, standardSchema: consentFailureSchema })
  @ApiResponse({ status: 409, standardSchema: consentFailureSchema })
  @ApiResponse({ status: 429, standardSchema: consentFailureSchema })
  @ApiResponse({ status: 503, standardSchema: consentFailureSchema })
  async save(
    @Body({ schema: saveChoiceSchema }) input: SaveChoice,
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Req() request: {
      method: string;
      path: string;
      socket: { remoteAddress?: string };
    },
    @Res({ passthrough: true }) response: {
      status: (status: number) => unknown;
      setHeader: (key: string, value: string) => unknown;
    },
  ) {
    response.status(HttpStatus.OK);
    response.setHeader("Cache-Control", "no-store");
    const proof = headers[consentHeader];
    if (proof !== undefined && typeof proof !== "string") {
      response.status(HttpStatus.BAD_REQUEST);
      return {
        ok: false,
        error: {
          code: PrivacyErrorCode.InvalidProof,
          message: "Invalid consent proof",
        },
        meta: readCorrelation(headers),
      };
    }
    const source = this.clientSource({
      headers,
      peer: request.socket.remoteAddress ?? "unknown",
      method: request.method,
      pathname: request.path,
    });
    const result = await savePreference(
      { ...input, source, contextProof: proof },
      this.dependencies,
    );
    if (result.isError()) {
      const code = result.getError();
      response.status(errorStatus[code]);
      return {
        ok: false,
        error: { code, message: "Consent preference was not saved" },
        meta: readCorrelation(headers),
      };
    }
    const { preference, contextProof } = result.get();
    return {
      ok: true,
      data: {
        state: publicPreference(preference),
        contextProof,
        expiresAt: preference.expiresAt,
      },
      meta: readCorrelation(headers),
    };
  }
}
