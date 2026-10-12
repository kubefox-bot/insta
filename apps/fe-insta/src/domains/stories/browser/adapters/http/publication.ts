import { SessionErrorCode } from "@insta/contracts/errors";
import { httpHeaderNames } from "@insta/contracts/http";
import { z } from "zod";
import { webSessionHeaders } from "../../../../../lib/session/contracts/index";
import { storySchema } from "../../../adapters/http/public-response/read";
import type { PreviewActor } from "../../preview/types";
import type {
  PublicationDependencies,
  PublicationOutcome,
} from "../../publication/types";
import {
  knownPublicationRejections,
  publicationTransport,
  recordingFilenames,
} from "./conts";

const metadata = z.object({
  operationId: z.string().optional(),
  requestId: z.string(),
});
const success = z.object({
  ok: z.literal(true),
  data: storySchema,
  meta: metadata,
});
const failure = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string() }),
  meta: metadata,
});
const status = z.object({
  ok: z.literal(true),
  data: z.discriminatedUnion("state", [
    z.object({ state: z.literal("not_found"), operationId: z.string() }),
    z.object({ state: z.literal("pending"), operationId: z.string() }),
    z.object({
      state: z.literal("failed"),
      operationId: z.string(),
      code: z.string(),
    }),
    z.object({
      state: z.literal("published"),
      operationId: z.string(),
      story: storySchema,
    }),
  ]),
  meta: metadata,
});
class PublicationTransport {
  /** Сохраняет транспорт и пути BFF; actor читается при подготовке запроса, без хранения токенов backend в браузере. */
  constructor(
    private readonly dependencies: Readonly<{
      request: (input: string, init?: RequestInit) => Promise<Response>;
      publishPath: string;
      publicationPath: (id: string) => string;
      actor: () => PreviewActor | null;
    }>,
  ) {}
  /** Формирует ключ идемпотентности и заголовки текущего actor; отсутствующая идентичность передаётся пустыми значениями для серверной проверки. */
  private readonly headers = (operationId: string) => {
    const owner = this.dependencies.actor();
    return {
      [httpHeaderNames.idempotencyKey]: operationId,
      [webSessionHeaders.ownerId]: owner?.userId ?? "",
      [webSessionHeaders.generation]: owner?.generation ?? "",
    };
  };
  /** Сопоставляет ответ публикации с operationId; авторизация выделяется отдельно, известные отказы подтверждаются, остальные результаты остаются unknown. */
  private readonly decodeOutcome = async (
    response: Response,
    operationId: string,
  ): Promise<PublicationOutcome> => {
    if (response.status === publicationTransport.unauthorized) {
      await response.body?.cancel();
      return { kind: "authentication" };
    }
    const raw: unknown = await response.json();
    if (response.ok) {
      const parsed = success.safeParse(raw);
      return parsed.success && parsed.data.meta.operationId === operationId
        ? { kind: "published" }
        : { kind: "unknown" };
    }
    const parsed = failure.safeParse(raw);
    if (
      parsed.success &&
      parsed.data.error.code === SessionErrorCode.ActorChanged
    )
      return { kind: "authentication" };
    if (
      parsed.success &&
      knownPublicationRejections.some((code) => code === parsed.data.error.code)
    )
      return { kind: "rejected", code: parsed.data.error.code };
    return { kind: "unknown" };
  };
  /** Передаёт Blob в multipart с operationId и захваченным поколением. Выбирает имя WebM либо сохранённое MP4; отмена, таймаут и сбой декодирования не доказывают отсутствие публикации. */
  readonly publish: PublicationDependencies["publish"] = async ({
    blob,
    operationId,
    generation,
    signal,
  }) => {
    const body = new FormData();
    const mediaType = blob.type.split(";")[0];
    const filename =
      mediaType === "video/webm"
        ? recordingFilenames[mediaType]
        : recordingFilenames["video/mp4"];
    body.set("video", blob, filename);
    try {
      const response = await this.dependencies.request(
        this.dependencies.publishPath,
        {
          method: "POST",
          body,
          headers: {
            ...this.headers(operationId),
            [webSessionHeaders.generation]: generation,
          },
          credentials: "same-origin",
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(publicationTransport.timeoutMs),
          ]),
        },
      );
      return await this.decodeOutcome(response, operationId);
    } catch {
      return { kind: "unknown" };
    }
  };
  /** Читает статус operationId без кеширования и валидирует ответ; ошибки и таймаут остаются unknown, а запрос авторизации выделяется отдельно. */
  readonly readPublication: PublicationDependencies["readPublication"] =
    async ({ operationId, signal }) => {
      try {
        const response = await this.dependencies.request(
          this.dependencies.publicationPath(operationId),
          {
            headers: this.headers(operationId),
            credentials: "same-origin",
            cache: "no-store",
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(publicationTransport.timeoutMs),
            ]),
          },
        );
        if (response.status === publicationTransport.unauthorized) {
          await response.body?.cancel();
          return { kind: "authentication" };
        }
        if (!response.ok) {
          const outcome = await this.decodeOutcome(response, operationId);
          return outcome.kind === "authentication"
            ? outcome
            : { kind: "unknown" };
        }
        const parsed = status.safeParse(await response.json());
        return parsed.success
          ? {
              kind: "known",
              state: parsed.data.data.state,
              operationId: parsed.data.data.operationId,
            }
          : { kind: "unknown" };
      } catch {
        return { kind: "unknown" };
      }
    };
}
/** Создаёт браузерный адаптер публикации и чтения статуса без доступа к backend-секретам. */
export const createPublicationTransport = (
  dependencies: ConstructorParameters<typeof PublicationTransport>[0],
): Pick<PublicationDependencies, "publish" | "readPublication"> =>
  new PublicationTransport(dependencies);
