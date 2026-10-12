import { z } from "zod";
import {
  defaultBrokerPort,
  defaults,
  localSupportHosts,
  maxPort,
  mongoReplicaSet,
  secretHexLength,
  supportRecipientSuffix,
} from "./conts";

const mongoUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "mongodb:" &&
    !!url.username &&
    !!url.password &&
    url.pathname === `/${defaults.database}` &&
    url.searchParams.get("authSource") === defaults.database &&
    url.searchParams.get("replicaSet") === mongoReplicaSet
  );
});
const brokerUrl = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["redis:", "rediss:"].includes(url.protocol) && !!url.password;
});
export const serverSchema = z
  .object({
    realtimeOrigin: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.origin === value && ["http:", "https:"].includes(url.protocol)
        );
      })
      .default(defaults.realtimeOrigin),
    supportRecipient: z
      .email()
      .refine((value) => value.endsWith(supportRecipientSuffix))
      .default(defaults.supportRecipient),
    supportSmtpHost: z
      .enum(localSupportHosts)
      .default(defaults.supportSmtpHost),
    supportSmtpPort: z.coerce
      .number()
      .int()
      .positive()
      .max(maxPort)
      .default(defaults.supportSmtpPort),
    logLevel: z
      .enum(["debug", "info", "warn", "error"])
      .default(defaults.logLevel),
    host: z.string().min(1).default(defaults.host),
    port: z.coerce
      .number()
      .int()
      .positive()
      .max(maxPort)
      .default(defaults.port),
    apiMongoUrl: mongoUrl,
    dragonflyUrl: brokerUrl,
    deliveryDragonflyUrl: brokerUrl,
    authSigningKey: z
      .string()
      .regex(new RegExp(`^[a-fA-F0-9]{${secretHexLength}}$`)),
    bffSourceSigningKey: z
      .string()
      .regex(new RegExp(`^[a-fA-F0-9]{${secretHexLength}}$`)),
    smtpHost: z.string().min(1).default(defaults.smtpHost),
    smtpPort: z.coerce
      .number()
      .int()
      .positive()
      .max(maxPort)
      .default(defaults.smtpPort),
    mailpitUrl: z.url().default(defaults.mailpitUrl),
  })
  .refine(
    (value) => {
      if (
        !URL.canParse(value.dragonflyUrl) ||
        !URL.canParse(value.deliveryDragonflyUrl)
      )
        return false;
      const auth = new URL(value.dragonflyUrl);
      const delivery = new URL(value.deliveryDragonflyUrl);
      return (
        auth.hostname !== delivery.hostname ||
        (auth.port || defaultBrokerPort) !==
          (delivery.port || defaultBrokerPort)
      );
    },
    {
      path: ["deliveryDragonflyUrl"],
      message: "Dedicated delivery endpoint required",
    },
  );
