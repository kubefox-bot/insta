import { readServerConfig } from "../../apps/be-insta/src/lib/config/index";
import { connectDatabase as connectApi } from "../../apps/be-insta/src/lib/database/index";
import { connectDragonfly } from "../../apps/be-insta/src/lib/dragonfly/index";
import { readServerConfig as readWebConfig } from "../../apps/fe-insta/src/lib/config/server/index";
import { connectDatabase as connectWeb } from "../../apps/fe-insta/src/lib/database/server/index";
export const readTestWebConfig = () => readWebConfig({ raw: Bun.env });
export const readTestApiConfig = () => readServerConfig({ raw: Bun.env });
export const createTestEnvironment = async ({
  testRunId,
}: {
  readonly testRunId: string;
}) => {
  if (!/^fnd04-[a-z0-9-]+$/.test(testRunId))
    throw new Error("Invalid test ownership");
  const apiConfig = readTestApiConfig();
  const webConfig = readWebConfig({ raw: Bun.env });
  const api = await connectApi({ config: apiConfig.mongo });
  try {
    const web = await connectWeb({ config: webConfig.mongo });
    try {
      const broker = await connectDragonfly({ config: apiConfig.dragonfly });
      const collection = `test_${testRunId.replaceAll("-", "_")}`;
      const keys: string[] = [];
      return {
        api,
        web,
        broker,
        collection,
        keys,
        urls: {
          api: "http://be-insta:3001",
          web: "http://fe-insta:3000",
          mail: apiConfig.mailpitUrl,
        },
        dispose: async () => {
          try {
            await Promise.all([
              api.apiDb.collection(collection).drop(),
              web.webDb.collection(collection).drop(),
              ...keys.map((key) => broker.del(key)),
            ]);
          } finally {
            broker.close();
            await Promise.all([api.close(), web.close()]);
          }
        },
      };
    } catch (error) {
      await web.close();
      throw error;
    }
  } catch (error) {
    await api.close();
    throw error;
  }
};
