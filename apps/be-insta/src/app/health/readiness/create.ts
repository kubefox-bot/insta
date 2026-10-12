import type { RedisClient } from "bun";
import type { Db } from "mongodb";
import { checkBrokerReadiness } from "./probes/broker";
import { checkDatabaseReadiness } from "./probes/database";
import { checkDeliveryReadiness } from "./probes/delivery";
import { checkMailReadiness } from "./probes/mail";
import type { DeliveryProbe, Readiness } from "./types";
/** Собирает readiness из Mongo и Dragonfly; Mailpit и mail workers влияют только на отдельный mail status. */
export const createInfrastructureReadiness = ({
  database,
  broker,
  timeoutMs,
  mailpitUrl,
  mailStatus,
  deliveryProbe,
}: Readonly<{
  database: Readonly<{ apiDb: Pick<Db, "command"> }>;
  broker: RedisClient;
  timeoutMs: number;
  mailpitUrl: string;
  mailStatus: () => "ok" | "degraded";
  deliveryProbe: DeliveryProbe;
}>): Readiness => {
  /** Параллельно проверяет Mongo и Dragonfly; бизнес admission разрешается только при успехе обоих probes. */
  const checkRequired = async () =>
    (
      await Promise.all([
        checkDatabaseReadiness(database.apiDb),
        checkBrokerReadiness(broker, timeoutMs),
      ])
    ).every(Boolean);
  return {
    checkRequired,
    /** Проверяет обязательные зависимости и Mailpit; degraded worker имеет приоритет над успешным mail probe. */
    check: async () => {
      const [required, mail, delivery] = await Promise.all([
        checkRequired(),
        checkMailReadiness(mailpitUrl),
        checkDeliveryReadiness(deliveryProbe),
      ]);
      return {
        ready: required,
        delivery,
        mail: mailStatus() === "degraded" ? ("degraded" as const) : mail,
      };
    },
  };
};
