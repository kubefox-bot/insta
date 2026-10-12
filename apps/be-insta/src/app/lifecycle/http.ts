import type { Server } from "node:http";

/** Останавливает HTTP listener и idle connections; уже остановленный сервер считается закрытым, другие ошибки передаются вызывающему коду. */
export const closeHttpServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (
        error &&
        !("code" in error && error.code === "ERR_SERVER_NOT_RUNNING")
      )
        reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
