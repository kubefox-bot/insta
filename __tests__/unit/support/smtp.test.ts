import { expect, test } from "bun:test";
import { createSmtpTransport } from "../../../apps/be-insta/src/lib/smtp/index";

test("shared SMTP rejects real RCPT refusal and closes its owned socket without reporting acceptance", async () => {
  const sockets = new Set<import("bun").Socket>();
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open: (socket) => {
        sockets.add(socket);
        socket.write("220 synthetic.insta.test ESMTP\r\n");
      },
      data: (socket, data) => {
        const command = data.toString();
        if (command.startsWith("RCPT"))
          socket.write("550 synthetic recipient refused\r\n");
        else if (command.startsWith("QUIT")) {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 synthetic.insta.test\r\n");
      },
      close: (socket) => {
        sockets.delete(socket);
      },
    },
  });
  const transport = createSmtpTransport({
    host: "127.0.0.1",
    port: listener.port,
  });
  try {
    await expect(
      transport.send({
        from: "registration@insta.test",
        to: "refused@insta.test",
        subject: "synthetic",
        messageId: "<synthetic@insta.test>",
        text: "synthetic",
      }),
    ).rejects.toThrow();
  } finally {
    await transport.close();
    for (const socket of sockets) socket.end();
    listener.stop(true);
  }
});

test("SMTP close waits for the owned stalled send and refuses new mail after closure", async () => {
  const connected = Promise.withResolvers<void>();
  const sockets = new Set<import("bun").Socket>();
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open: (socket) => {
        sockets.add(socket);
        connected.resolve();
      },
      data: () => {},
      close: (socket) => {
        sockets.delete(socket);
      },
    },
  });
  const transport = createSmtpTransport({
    host: "127.0.0.1",
    port: listener.port,
  });
  const input = {
    from: "registration@insta.test",
    to: "synthetic@insta.test",
    subject: "synthetic",
    messageId: "<synthetic@insta.test>",
    text: "synthetic",
  };
  let sendSettled = false;
  const sending = transport
    .send(input)
    .catch(() => {})
    .finally(() => {
      sendSettled = true;
    });
  await connected.promise;
  try {
    await transport.close();
    expect(sendSettled).toBe(true);
    await expect(transport.send(input)).rejects.toThrow(
      "SMTP transport closed",
    );
  } finally {
    await sending;
    for (const socket of sockets) socket.end();
    listener.stop(true);
  }
});
