import { signClientSource } from "../../../../../../lib/http/server/index";
/**
 * Получает доверенный источник и подписывает его для POST указанного пути с текущим временем;
 * отказ получения источника передаёт вызывающему коду.
 */
export const createSignedHeaders = async ({
  source,
  key,
  pathname,
}: Readonly<{
  source: () => Promise<string>;
  key: string;
  pathname: string;
}>) =>
  signClientSource({
    source: await source(),
    key,
    now: Date.now(),
    method: "POST",
    pathname,
  });
