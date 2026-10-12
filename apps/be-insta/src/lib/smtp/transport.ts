import nodemailer from "nodemailer";
import { smtpTimeoutMs } from "./conts";
/** Создаёт SMTP-клиент без пула и журналирования писем; владелец обязан вызвать close после завершения отправок. */
export const createSmtpTransport = (
  config: Readonly<{ host: string; port: number }>,
) => {
  const transport = nodemailer.createTransport({
    ...config,
    secure: false,
    pool: false,
    connectionTimeout: smtpTimeoutMs,
    greetingTimeout: smtpTimeoutMs,
    socketTimeout: smtpTimeoutMs,
    logger: false,
    debug: false,
  });
  const pending = new Set<Promise<"accepted">>();
  let closing: Promise<void> | undefined;
  let closed = false;
  return {
    /** Отправляет письмо без доступа к файлам и URL; успех означает принятие адресата SMTP-сервером, а не доставку в ящик. */
    send: (
      input: Readonly<{
        from: string;
        to: string;
        messageId: string;
        subject: string;
        text: string;
        html?: string;
      }>,
    ) => {
      if (closed) return Promise.reject(new Error("SMTP transport closed"));
      const operation = transport
        .sendMail({
          ...input,
          disableFileAccess: true,
          disableUrlAccess: true,
        })
        .then((result) => {
          if (!result.accepted.includes(input.to))
            throw new Error("SMTP not accepted");
          return "accepted" as const;
        });
      pending.add(operation);
      operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    /** Запрещает новые отправки и ждёт settlement уже начатых перед закрытием транспорта; повторные вызовы разделяют Promise. */
    close: () => {
      closed = true;
      closing ??= Promise.allSettled([...pending]).then(() =>
        transport.close(),
      );
      return closing;
    },
  };
};
