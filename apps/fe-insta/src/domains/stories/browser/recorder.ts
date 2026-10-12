import { get, readonly, writable } from "svelte/store";
import type { PreviewActor } from "./preview/types";
import { createPublication } from "./publish";
import { createCamera } from "./recorder/camera";
import type {
  RecorderView,
  StoryRecorder,
  StoryRecorderDependencies,
} from "./recorder/types";

class StoryRecorderController implements StoryRecorder {
  private readonly store = writable<RecorderView>({ kind: "closed" });
  readonly view = readonly(this.store);
  private active = false;
  private disposed = false;
  private cameraDisabled = false;
  private visibilityEpoch = 0;
  private visibilityOwner: PreviewActor | null = null;
  private visibilitySettlement: Promise<void> = Promise.resolve();
  private actor: PreviewActor | null = null;
  private readonly publication: ReturnType<typeof createPublication>;
  private readonly camera: ReturnType<typeof createCamera>;
  private readonly releases: ReadonlyArray<() => void>;
  /** Связывает preview, публикацию, камеру и сессию; владеет подписками и их освобождением в dispose. */
  constructor(private readonly dependencies: StoryRecorderDependencies) {
    this.actor = this.currentActor();
    this.publication = createPublication({
      ...dependencies,
      actor: this.currentActor,
      onAuthentication: dependencies.continuation,
    });
    this.camera = createCamera({
      factory: dependencies.recorderFactory,
      /** Принимает записанный Blob в preview только при активном контроллере и текущем actor. */
      onRecorded: ({ blob }) => {
        const actor = this.currentActor();
        if (!this.active || !actor || this.disposed) return;
        dependencies.preview.replace({ actor, blob });
      },
    });
    this.releases = [
      dependencies.preview.view.subscribe(this.previewChanged),
      this.publication.view.subscribe(this.project),
      this.camera.view.subscribe(this.project),
      dependencies.session.subscribe(this.identityChanged),
    ];
  }
  /** Читает актуального actor из сессии перед действием или проекцией. */
  private readonly currentActor = () => get(this.dependencies.session).actor;
  /** Восстанавливает видимый URL preview и сбрасывает незавершённую публикацию при потере ресурса, затем обновляет представление. */
  private readonly previewChanged = () => {
    const actor = this.currentActor();
    if (this.active && actor) this.dependencies.preview.reopen(actor);
    if (
      !this.dependencies.preview.capture() &&
      ["checking", "uploading"].includes(get(this.publication.view).kind)
    )
      this.publication.reset();
    this.project();
  };
  /** Реагирует на смену поколения: для другого пользователя удаляет preview и публикацию, инвалидирует возврат видимости и приостанавливает ресурсы. */
  private readonly identityChanged = (
    identity: Readonly<{ actor: PreviewActor | null }>,
  ) => {
    const previous = this.actor;
    this.actor = identity.actor;
    if (previous?.generation === identity.actor?.generation) {
      this.project();
      return;
    }
    this.visibilityEpoch++;
    const resource = this.dependencies.preview.capture();
    if (
      identity.actor &&
      resource &&
      resource.actor.userId !== identity.actor.userId
    ) {
      this.dependencies.preview.discard(resource);
      this.publication.reset();
    }
    this.suspend().catch(this.cleanupFailure);
  };
  /** Строит вид recorder из активности, actor, публикации, preview и камеры, не открывая ресурсы самостоятельно. */
  private readonly project = () => {
    const actor = this.currentActor();
    if (!this.active || this.disposed || !actor) {
      this.store.set({ kind: "closed" });
      return;
    }
    const publication = get(this.publication.view);
    switch (publication.kind) {
      case "uploading":
      case "published":
        this.store.set(publication);
        return;
      case "checking":
        this.store.set({
          ...publication,
          url: this.dependencies.preview.read(actor)?.url,
        });
        return;
      case "idle":
      case "rejected":
        break;
    }
    const resource = this.dependencies.preview.read(actor);
    if (resource?.url) {
      this.store.set({
        kind: "preview",
        url: resource.url,
        ...(publication.kind === "rejected" ? { issue: publication.code } : {}),
      });
      return;
    }
    const camera = get(this.camera.view);
    this.store.set(
      camera.state.status === "error"
        ? { kind: "error", code: camera.state.error.code }
        : { kind: "ready", camera, cameraDisabled: this.cameraDisabled },
    );
  };
  /** Показывает сбой освобождения ресурсов, пока контроллер ещё не уничтожен. */
  private readonly cleanupFailure = () => {
    if (!this.disposed)
      this.store.set({ kind: "error", code: "cleanup-failed" });
  };
  /** При скрытии приостанавливает ресурсы и блокирует камеру; при возвращении ждёт освобождения и открывает только для того же actor и поколения видимости. */
  readonly setHidden = async (hidden: boolean) => {
    if (hidden) {
      this.visibilityEpoch++;
      if (!this.active || this.visibilityOwner) return;
      this.visibilityOwner = this.currentActor();
      this.cameraDisabled = true;
      this.visibilitySettlement = this.suspendResources();
      await this.visibilitySettlement;
      return;
    }
    const epoch = this.visibilityEpoch;
    const owner = this.visibilityOwner;
    await this.visibilitySettlement;
    const actor = this.currentActor();
    if (
      epoch !== this.visibilityEpoch ||
      !owner ||
      !actor ||
      owner.userId !== actor.userId ||
      owner.generation !== actor.generation ||
      this.disposed
    )
      return;
    this.visibilityOwner = null;
    await this.open();
  };
  /** Скрывает контроллер, отменяет локальную публикацию, отзывает URL preview и дожидается освобождения камеры. */
  private readonly suspendResources = async () => {
    this.active = false;
    this.publication.cancel();
    this.dependencies.preview.conceal();
    await this.camera.release();
    this.project();
  };
  /** Инвалидирует автоматический возврат видимости и приостанавливает ресурсы с ожиданием завершения камеры. */
  readonly suspend = async () => {
    this.visibilityEpoch++;
    this.visibilityOwner = null;
    await this.suspendResources();
  };
  /** Открывает preview текущего actor; без actor передаёт управление продолжению авторизации, не публикуя запись. */
  readonly open = async () => {
    if (this.disposed) return;
    const actor = this.currentActor();
    if (!actor) {
      await this.dependencies.continuation();
      return;
    }
    this.active = true;
    this.dependencies.preview.reopen(actor);
    this.project();
  };
  /** Включает камеру лишь для активного actor без preview и без неопределённой публикации. */
  readonly enableCamera = async () => {
    if (
      !this.active ||
      !this.currentActor() ||
      !this.publication.canRetake() ||
      this.dependencies.preview.capture()
    )
      return;
    this.cameraDisabled = false;
    await this.camera.enable();
  };
  /** Запускает запись только при активном контроллере и текущем actor. */
  readonly start = () => {
    if (this.active && this.currentActor()) this.camera.start();
  };
  /** Возвращает завершение записи и освобождения нативного recorder владельцу вызова. */
  readonly stop = () => this.camera.stop();
  /** Разрешает пересъёмку лишь при определённом исходе публикации, освобождает камеру и preview и сбрасывает состояние публикации. */
  readonly retake = async () => {
    if (!this.publication.canRetake()) return;
    await this.camera.release();
    const resource = this.dependencies.preview.capture();
    if (resource) this.dependencies.preview.discard(resource);
    this.publication.reset();
    this.project();
  };
  /** Сообщает о загрузке или проверке неизвестного исхода для предупреждения при уходе. */
  readonly hasPendingPublication = () =>
    ["uploading", "checking"].includes(get(this.publication.view).kind);
  /** Передаёт явное подтверждение контроллеру публикации с его проверками actor и идемпотентности. */
  readonly confirmPublish = () => this.publication.confirm();
  /** Проверяет состояние уже отправленной публикации без нового автоматического upload. */
  readonly checkPublication = () => this.publication.check();
  /** Приостанавливает ресурсы; preview и идентичность неизвестной публикации сохраняет, а при определённом исходе удаляет и сбрасывает. */
  readonly close = async () => {
    this.visibilityEpoch++;
    this.visibilityOwner = null;
    await this.suspend();
    if (!this.publication.canRetake()) return;
    const resource = this.dependencies.preview.capture();
    if (resource) this.dependencies.preview.discard(resource);
    this.publication.reset();
  };
  /** Снимает подписки, закрывает публикацию, дожидается камеры и освобождает preview, после чего закрывает представление. */
  readonly dispose = async () => {
    this.disposed = true;
    for (const release of this.releases) release();
    this.publication.dispose();
    await this.camera.release();
    this.dependencies.preview.dispose();
    this.store.set({ kind: "closed" });
  };
}
/** Создаёт владельца сценария записи, ресурсов камеры и публикации; вызывающий владелец должен дождаться dispose. */
export const createStoryRecorder = (
  dependencies: StoryRecorderDependencies,
): StoryRecorder => new StoryRecorderController(dependencies);
