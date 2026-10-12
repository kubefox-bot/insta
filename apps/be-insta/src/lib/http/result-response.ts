import type { Result } from "@bloodyowl/boxed";
import type { Correlation } from "@insta/contracts/http";
/** Преобразует ожидаемый Result в JSON envelope, сохраняя данные, ошибку и переданную корреляцию. */
export const resultResponse = <Data, Error>({
  result,
  meta,
}: {
  readonly result: Result<Data, Error>;
  readonly meta: Correlation;
}) =>
  result.isOk()
    ? { ok: true as const, data: result.get(), meta }
    : { ok: false as const, error: result.getError(), meta };
