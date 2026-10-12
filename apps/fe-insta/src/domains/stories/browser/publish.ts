import { StoryErrorCode } from "@insta/contracts/errors";
import { storyWireLimits } from "@insta/contracts/stories";
import { get, readonly, writable } from "svelte/store";
import { createRequestLifetime } from "./lib/request-lifetime/create";
import type {
  Publication,
  PublicationDependencies,
  PublicationOutcome,
  PublicationStatus,
  PublicationView,
} from "./publication/types";

/** Владеет идентичностью отправки; сбой транспорта не доказывает отсутствие записи. */
class PublicationController implements Publication {
  private readonly state = writable<PublicationView>({ kind: "idle" });
  readonly view = readonly(this.state);
  private readonly lifetime = createRequestLifetime();
  private request:
    | NonNullable<ReturnType<typeof this.lifetime.begin>>
    | undefined = undefined;
  private disposed = false;
  /** Сохраняет зависимости публикации; идентичность отправки и lifetime принадлежат этому экземпляру. */
  constructor(private readonly dependencies: PublicationDependencies) {}
  /** Фиксирует подтверждённую публикацию, удаляет локальный preview и дожидается внешнего уведомления. */
  private readonly published = async (operationId: string) => {
    this.state.set({ kind: "published", operationId });
    const preview = this.dependencies.preview.capture();
    if (preview) this.dependencies.preview.discard(preview);
    await this.dependencies.onPublished();
  };
  /** Сохраняет operationId в состоянии проверки неизвестного исхода. */
  private readonly unknown = (operationId: string) =>
    this.state.set({ kind: "checking", operationId, status: "unknown" });
  /** Применяет проверенный статус только совпадающего operationId; not_found сохраняет идентичность для явного повтора, авторизация передаётся продолжению. */
  private readonly acceptStatus = async (
    input: Readonly<{ result: PublicationStatus; operationId: string }>,
  ) => {
    const { result, operationId } = input;
    if (result.kind === "authentication") {
      await this.dependencies.onAuthentication();
      return;
    }
    if (result.kind === "unknown" || result.operationId !== operationId) {
      this.unknown(operationId);
      return;
    }
    switch (result.state) {
      case "published":
        await this.published(operationId);
        return;
      case "failed":
        this.state.set({ kind: "rejected", code: "PUBLICATION_FAILED" });
        return;
      case "pending":
      case "not_found":
        this.state.set({ kind: "checking", operationId, status: result.state });
        return;
      default: {
        const exhaustive: never = result.state;
        throw new Error(String(exhaustive));
      }
    }
  };
  /** Различает подтверждение, отказ, авторизацию и неизвестный исход отправки; при авторизации сохраняет operationId до продолжения. */
  private readonly acceptOutcome = async (
    input: Readonly<{ result: PublicationOutcome; operationId: string }>,
  ) => {
    const { result, operationId } = input;
    switch (result.kind) {
      case "published":
        await this.published(operationId);
        return;
      case "rejected":
        this.state.set({ kind: "rejected", code: result.code });
        return;
      case "authentication":
        this.unknown(operationId);
        await this.dependencies.onAuthentication();
        return;
      case "unknown":
        this.unknown(operationId);
        return;
      default: {
        const exhaustive: never = result;
        throw new Error(String(exhaustive));
      }
    }
  };
  /** Выполняет одну попытку с новым signal и применяет результат только актуального поколения; ошибки до подтверждения сохраняют неизвестный исход. */
  private readonly execute = async (
    input: Readonly<{
      operationId: string;
      run: (signal: AbortSignal) => Promise<() => Promise<void>>;
    }>,
  ) => {
    const request = this.lifetime.begin();
    if (!request) return;
    this.request = request;
    try {
      const accept = await input.run(request.signal);
      if (request.isCurrent()) await accept();
    } catch {
      if (request.isCurrent() && get(this.state).kind !== "published")
        this.unknown(input.operationId);
    } finally {
      if (this.request === request) this.request = undefined;
    }
  };
  /** Читает статус только ожидающей проверки публикации без параллельной попытки; при отсутствии actor требует авторизацию. */
  readonly check = async () => {
    const snapshot = get(this.state);
    if (this.disposed || this.request || snapshot.kind !== "checking") return;
    if (!this.dependencies.actor()) {
      await this.dependencies.onAuthentication();
      return;
    }
    await this.execute({
      operationId: snapshot.operationId,
      /** Получает статус под отменяемым запросом и возвращает отложенное применение после проверки поколения. */
      run: async (signal) => {
        const result = await this.dependencies.readPublication({
          operationId: snapshot.operationId,
          signal,
        });
        return () =>
          this.acceptStatus({ result, operationId: snapshot.operationId });
      },
    });
  };
  /** Обрабатывает явное подтверждение: проверяет actor, preview и размер; неизвестный исход сначала проверяет, а после not_found повторяет с прежним operationId. */
  readonly confirm = async () => {
    const snapshot = get(this.state);
    if (
      this.disposed ||
      this.request ||
      snapshot.kind === "published" ||
      snapshot.kind === "uploading"
    )
      return;
    if (snapshot.kind === "checking" && snapshot.status !== "not_found") {
      await this.check();
      return;
    }
    const actor = this.dependencies.actor();
    if (!actor) {
      await this.dependencies.onAuthentication();
      return;
    }
    const resource = this.dependencies.preview.read(actor);
    if (!resource) return;
    if (resource.blob.size > storyWireLimits.maxFileBytes) {
      this.state.set({ kind: "rejected", code: StoryErrorCode.FileTooLarge });
      return;
    }
    const operationId =
      snapshot.kind === "checking"
        ? snapshot.operationId
        : this.dependencies.uuid();
    this.state.set({ kind: "uploading", operationId });
    await this.execute({
      operationId,
      /** Отправляет захваченный Blob с operationId и поколением actor, откладывая применение результата до проверки актуальности запроса. */
      run: async (signal) => {
        const result = await this.dependencies.publish({
          blob: resource.blob,
          operationId,
          generation: actor.generation,
          signal,
        });
        return () => this.acceptOutcome({ result, operationId });
      },
    });
  };
  /** Инвалидирует текущий запрос; отменённую загрузку переводит в проверку с тем же operationId, поскольку отмена не доказывает отсутствие записи. */
  readonly cancel = () => {
    const snapshot = get(this.state);
    this.lifetime.release();
    this.request = undefined;
    if (snapshot.kind === "uploading") this.unknown(snapshot.operationId);
  };
  /** Разрешает пересъёмку только в idle, rejected или published, сохраняя ресурс при неизвестном исходе. */
  readonly canRetake = () =>
    ["idle", "rejected", "published"].includes(get(this.state).kind);
  /** Отменяет текущую попытку и явно сбрасывает локальное состояние публикации в idle. */
  readonly reset = () => {
    this.cancel();
    this.state.set({ kind: "idle" });
  };
  /** Отменяет попытку и навсегда запрещает новые запросы этого контроллера. */
  readonly dispose = () => {
    this.cancel();
    this.disposed = true;
    this.lifetime.dispose();
  };
}
/** Создаёт владельца идентичности публикации, явного подтверждения и проверки неопределённого результата. */
export const createPublication = (
  dependencies: PublicationDependencies,
): Publication => new PublicationController(dependencies);
