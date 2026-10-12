import { createRealtimeServer } from "../../../../lib/realtime/index";
import { authenticateSocket, handshakeError } from "./handshake";
import { receiveCommands } from "./receive-command";
import type { GatewayDependencies, Recipient } from "./types";
import { watchSession } from "./watch-session";
/**
 * Владеет realtime server, реестрами sockets и pending lifecycle-операциями; close
 * прекращает handshake, закрывает sockets и ждёт их cleanup.
 */
export const createConversationGateway = (
  dependencies: GatewayDependencies,
) => {
  const recipients = new Map<string, Recipient>();
  const sessions = new Map<string, Set<string>>();
  const operations = new Set<Promise<void>>();
  let closing = false;
  /**
   * Учитывает lifecycle Promise до его settlement для shutdown, удаляя завершённые и
   * отклонённые операции из собственного набора.
   */
  const own = (operation: Promise<void>) => {
    operations.add(operation);
    operation.then(
      () => operations.delete(operation),
      () => operations.delete(operation),
    );
  };
  const io = createRealtimeServer({
    server: dependencies.server,
    origin: dependencies.origin,
    /** Разрешает новые подключения лишь пока gateway не начал закрытие. */
    accepting: () => !closing,
  });
  io.use((socket, next) => {
    own(
      authenticateSocket({ socket, dependencies, recipients, sessions }).then(
        () => {
          if (closing) {
            socket.disconnect(true);
            next(handshakeError(new Error("Server closing")));
          } else next();
        },
        (failure: unknown) => next(handshakeError(failure)),
      ),
    );
  });
  io.on("connection", (socket) => {
    const recipient = recipients.get(socket.id);
    if (!recipient || closing) {
      socket.disconnect(true);
      return;
    }
    const watch = watchSession({
      recipient,
      authorize: dependencies.authorize,
    });
    const commands = receiveCommands({ recipient, dependencies });
    socket.once("disconnect", () => {
      own(
        Promise.all([
          watch.close(),
          commands.close(),
          recipient.deliveries.close(),
        ]).then(() => {}),
      );
    });
  });
  return {
    /**
     * Закрывает приём подключений и Socket.IO server, затем ждёт settlement
     * зарегистрированных handshake и disconnect cleanup.
     */
    close: async () => {
      closing = true;
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await Promise.allSettled(operations);
    },
  };
};
