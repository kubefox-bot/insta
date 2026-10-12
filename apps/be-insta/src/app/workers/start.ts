import type { RedisClient } from "bun";
import type { SupportDependencies } from "../../domains/support-reports/index";
import {
  createSupportEmail,
  startSupportWorker,
} from "../../domains/support-reports/server/index";
import {
  createDragonflyEmailJobs,
  createSmtpSender,
  startRegistrationWorker,
} from "../../domains/users/server/index";
import type { readRuntimeConfig } from "../../lib/config/index";
import type { createUsersDependencies } from "../composition/users/index";
/** Запускает регистрационный и support mail workers с отдельными SMTP-клиентами; возвращает общий status и close. */
export const startMailWorkers = ({
  config,
  broker,
  users,
  support,
}: Readonly<{
  config: ReturnType<typeof readRuntimeConfig>;
  broker: RedisClient;
  users: Awaited<ReturnType<typeof createUsersDependencies>>;
  support: SupportDependencies;
}>) => {
  const email = createSupportEmail({
    ...config.supportSmtp,
    recipient: config.supportRecipient,
  });
  const supportWorker = startSupportWorker({
    reports: {
      recover: support.reports.recover,
      claim: support.reports.claim,
      finish: support.reports.finish,
      cleanup: support.reports.cleanup,
    },
    jobs: { next: support.jobs.next, acknowledge: support.jobs.acknowledge },
    clock: support.clock,
    uuid: support.uuid,
    email,
  });
  const sender = createSmtpSender(config.smtp);
  const registrationWorker = startRegistrationWorker({
    jobs: createDragonflyEmailJobs({
      client: broker,
      consumer: crypto.randomUUID(),
      clock: Date.now,
    }),
    crypto: users.registration.crypto,
    registration: users.registration.registration,
    sender,
    clock: Date.now,
  });
  let closing: Promise<void> | undefined;
  /** Ждёт обоих mail workers, затем закрывает SMTP-клиенты; ошибку worker передаёт после попытки cleanup. */
  const close = async () => {
    const results = await Promise.allSettled([
      registrationWorker.close(),
      supportWorker.close(),
    ]);
    await Promise.all([sender.close(), email.close()]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  };
  return {
    /** Считает mail-службы здоровыми только когда оба worker сообщают ok. */
    status: () =>
      registrationWorker.status() === "ok" && supportWorker.status() === "ok"
        ? ("ok" as const)
        : ("degraded" as const),
    /** Делит один Promise остановки между повторными вызовами, исключая повторное закрытие mail-ресурсов. */
    close: () => {
      closing ??= close();
      return closing;
    },
  };
};
