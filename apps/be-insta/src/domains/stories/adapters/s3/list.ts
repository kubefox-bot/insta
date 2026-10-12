import { z } from "zod";
import type { StoryStorage } from "../../ports/storage/interfaces";
import { storagePolicy } from "./conts";
import { storageFailure } from "./failure";
import type { StorageResolver } from "./types";

const pageSchema = z
  .object({
    isTruncated: z.boolean(),
    nextContinuationToken: z.string().min(1).optional(),
    contents: z
      .array(
        z.object({
          key: z.string().min(1),
          size: z.number().int().nonnegative(),
        }),
      )
      .default([]),
  })
  .refine((page) => !page.isTruncated || !!page.nextContinuationToken);
/**
 * Создаёт чтение ограниченной страницы inventory внутри профиля; валидирует ответ и
 * continuation token, ошибки провайдера не превращает в пустую страницу.
 */
export const list =
  (resolve: StorageResolver): StoryStorage["list"] =>
  async ({ profile, prefix, cursor, limit }) => {
    const client = resolve(profile, prefix).internal;
    if (
      !Number.isSafeInteger(limit) ||
      limit <= 0 ||
      limit > storagePolicy.maxPageSize
    )
      throw new Error("Invalid storage page size");
    try {
      const page = pageSchema.parse(
        await client.list({
          prefix,
          maxKeys: limit,
          ...(cursor ? { continuationToken: cursor } : {}),
        }),
      );
      return {
        objects: page.contents.map((object) => ({
          profile,
          key: object.key,
          byteLength: object.size,
        })),
        ...(page.isTruncated && page.nextContinuationToken
          ? { cursor: page.nextContinuationToken }
          : {}),
      };
    } catch (cause) {
      throw storageFailure({ operation: "list", cause });
    }
  };
