import { type CollectionOptions, type Db, MongoServerError } from "mongodb";
import { z } from "zod";

export const runtimeCollectionNamespaceSchema = z
  .string()
  .regex(/^test_chat03_runtime_[a-f0-9]{32}_$/)
  .brand<"RuntimeCollectionNamespace">();

export const createDatabaseNamespace = ({
  db,
  prefix,
}: Readonly<{
  db: Db;
  prefix: z.infer<typeof runtimeCollectionNamespaceSchema>;
}>) => {
  const acquired = new Set<string>();
  const namespaced = new Proxy(db, {
    get(target, property) {
      if (property === "collection")
        return (name: string, options?: CollectionOptions) => {
          const owned = `${prefix}${name}`;
          acquired.add(owned);
          return target.collection(owned, options);
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return {
    db: namespaced,
    dispose: async () => {
      const dropped = await Promise.allSettled(
        [...acquired].map(async (name) => {
          try {
            await db.collection(name).drop();
          } catch (error) {
            if (!(error instanceof MongoServerError && error.code === 26))
              throw error;
          }
        }),
      );
      const failures = dropped.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (
        await db.listCollections({ name: { $regex: `^${prefix}` } }).hasNext()
      )
        failures.push(new Error("Owned runtime collections retained"));
      if (failures.length)
        throw new AggregateError(
          failures,
          "Owned runtime namespace cleanup failed",
        );
    },
  };
};
