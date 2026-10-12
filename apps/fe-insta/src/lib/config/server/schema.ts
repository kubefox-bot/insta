import { z } from "zod";
import {
  defaultApiMaxResponseBytes,
  defaultApiTimeoutMs,
  defaultLogLevel,
  maxApiResponseBytes,
  maxApiTimeoutMs,
} from "../conts";
export const apiSchema = z.strictObject({
  baseURL: z
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  timeoutMs: z.coerce
    .number()
    .int()
    .positive()
    .max(maxApiTimeoutMs)
    .default(defaultApiTimeoutMs),
  maxResponseBytes: z.coerce
    .number()
    .int()
    .positive()
    .max(maxApiResponseBytes)
    .default(defaultApiMaxResponseBytes),
});
export const loggingSchema = z.object({
  logLevel: z.enum(["debug", "info", "warn", "error"]).default(defaultLogLevel),
});
export const serverSchema = z.object({
  logLevel: loggingSchema.shape.logLevel,
  webMongoUrl: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "mongodb:" &&
      !!url.username &&
      !!url.password &&
      url.pathname === "/insta_web" &&
      url.searchParams.get("authSource") === "insta_web" &&
      url.searchParams.get("replicaSet") === "rs0"
    );
  }),
  sessionEncryptionKey: z.string().regex(/^[a-fA-F0-9]{64}$/),
  bffSourceSigningKey: z.string().regex(/^[a-fA-F0-9]{64}$/),
  trustedWebProxyHost: z.hostname().optional(),
});
