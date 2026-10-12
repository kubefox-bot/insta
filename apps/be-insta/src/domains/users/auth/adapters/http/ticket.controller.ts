import { CommonErrorCode } from "@insta/contracts/errors";
import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";
import type { NativeResponse } from "../../../../../lib/http/index";
import { readCorrelation } from "../../../../../lib/http/index";
import { ticketDependenciesToken } from "../../domain/ws/conts";
import type { WsTickets } from "../../ports/ws-tickets";
import { issueWsTicket } from "../../use-cases/issue-ws-ticket";
import { authDependenciesToken } from "./conts";
import { authFailure } from "./reply";
import { authFailureSchema } from "./session.dto";
import { authorizeBearer } from "./session.guard";
import { wsTicketSuccessSchema } from "./ticket.dto";
import type { AuthHttpDependencies } from "./types";
@Controller("v1/auth")
export class TicketController {
  /**
   * Получает auth и необязательный порт tickets из composition; отсутствие порта не
   * отключает проверку bearer.
   */
  constructor(
    @Inject(authDependenciesToken) private readonly auth: AuthHttpDependencies,
    @Inject(ticketDependenciesToken) private readonly tickets: WsTickets | null,
  ) {}
  /**
   * После авторизации создаёт одноразовый WS ticket; недоступный порт возвращает 503,
   * ответ запрещено кэшировать.
   */
  @Post("ws-ticket")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ operationId: "issueWsTicket" })
  @ApiResponse({ status: 200, standardSchema: wsTicketSuccessSchema })
  @ApiResponse({ status: 401, standardSchema: authFailureSchema })
  @ApiResponse({ status: 503, standardSchema: authFailureSchema })
  async issue(
    @Headers() headers: Readonly<Record<string, unknown>>,
    @Res({ passthrough: true }) response: NativeResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const meta = readCorrelation(headers);
    const actor = await authorizeBearer(headers, this.auth);
    if (actor.isError())
      return authFailure({ code: actor.getError(), response, meta });
    if (!this.tickets) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        ok: false,
        error: { code: CommonErrorCode.InternalError, message: "Unavailable" },
        meta,
      };
    }
    return {
      ok: true,
      data: await issueWsTicket(
        { actor: actor.get() },
        {
          tickets: this.tickets,
          clock: this.auth.clock,
          /**
           * Выделяет случайный UUID для нового WS ticket; сохранение и срок принадлежат
           * сценарию выдачи.
           */
          random: () => crypto.randomUUID(),
        },
      ),
      meta,
    };
  }
}
