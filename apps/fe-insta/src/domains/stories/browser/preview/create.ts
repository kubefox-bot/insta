import { readonly, writable } from "svelte/store";
import type {
  PreviewActor,
  PreviewDependencies,
  PreviewResource,
} from "./types";

class StoryPreview {
  private readonly uuid: () => string;
  private readonly urls: NonNullable<PreviewDependencies["urls"]>;
  /** Создаёт владельца локального Blob и object URL с подменяемыми uuid/URL API; dispose освобождает ресурс. */
  constructor({
    uuid = () => crypto.randomUUID(),
    urls = {
      /** Создаёт object URL для локального Blob, принадлежащий preview-контроллеру. */
      create: (blob) => URL.createObjectURL(blob),
      /** Отзывает object URL при скрытии или освобождении preview. */
      revoke: (url) => URL.revokeObjectURL(url),
    },
  }: PreviewDependencies = {}) {
    this.uuid = uuid;
    this.urls = urls;
  }
  private readonly store = writable<
    Readonly<{ kind: "empty" } | { kind: "available"; previewId: string }>
  >({ kind: "empty" });
  private readonly state: { resource?: PreviewResource; disposed: boolean } = {
    disposed: false,
  };
  /** Отсоединяет ресурс от состояния, очищает вид и отзывает существующий object URL. */
  private readonly release = () => {
    const resource = this.state.resource;
    this.state.resource = undefined;
    this.store.set({ kind: "empty" });
    if (resource?.url) this.urls.revoke(resource.url);
  };
  readonly view = readonly(this.store);
  /** Создаёт preview для копии actor, освобождая предыдущий ресурс; после dispose отказывается принимать новый Blob. */
  readonly replace = ({
    actor,
    blob,
  }: Readonly<{ actor: PreviewActor; blob: Blob }>) => {
    if (this.state.disposed) return undefined;
    const resource = {
      actor: { ...actor },
      blob,
      previewId: this.uuid(),
      url: this.urls.create(blob),
    };
    this.release();
    this.state.resource = resource;
    this.store.set({ kind: "available", previewId: resource.previewId });
    return resource.previewId;
  };
  /** Возвращает ресурс только при совпадении пользователя и поколения actor. */
  readonly read = (actor: PreviewActor) => {
    const resource = this.state.resource;
    return resource &&
      resource.actor.userId === actor.userId &&
      resource.actor.generation === actor.generation
      ? resource
      : undefined;
  };
  /** Отзывает URL, сохраняя Blob и previewId для последующего явного возвращения. */
  readonly conceal = () => {
    const resource = this.state.resource;
    if (!resource?.url) return;
    this.urls.revoke(resource.url);
    this.state.resource = { ...resource, url: undefined };
    this.store.set({ kind: "available", previewId: resource.previewId });
  };
  /** Воссоздаёт отсутствующий URL только для ресурса текущего actor. */
  readonly reopen = (actor: PreviewActor) => {
    const resource = this.read(actor);
    if (!resource || resource.url) return resource;
    const reopened = { ...resource, url: this.urls.create(resource.blob) };
    this.state.resource = reopened;
    this.store.set({ kind: "available", previewId: resource.previewId });
    return reopened;
  };
  /** Возвращает идентичность preview и копию actor без передачи Blob или URL в продолжение авторизации. */
  readonly capture = () => {
    const resource = this.state.resource;
    return resource
      ? { actor: { ...resource.actor }, previewId: resource.previewId }
      : undefined;
  };
  /** Привязывает сохранённый preview к новому поколению того же пользователя только при совпадении previewId; иной ресурс не восстанавливает. */
  readonly restore = ({
    actor,
    previewId,
  }: Readonly<{ actor: PreviewActor; previewId: string }>):
    | "restored"
    | "missing" => {
    const resource = this.state.resource;
    if (
      !resource ||
      resource.previewId !== previewId ||
      resource.actor.userId !== actor.userId
    )
      return "missing";
    this.state.resource = { ...resource, actor: { ...actor } };
    this.store.set({ kind: "available", previewId: resource.previewId });
    return "restored";
  };
  /** Освобождает preview лишь при совпадении его идентификатора с текущим ресурсом. */
  readonly discard = ({ previewId }: Readonly<{ previewId: string }>) => {
    if (this.state.resource?.previewId === previewId) this.release();
  };
  /** Освобождает Blob/URL из состояния и запрещает дальнейшую замену preview. */
  readonly dispose = () => {
    this.release();
    this.state.disposed = true;
  };
}
/** Создаёт изолированное локальное хранилище preview с явным владельцем object URL. */
export const createStoryPreview = (dependencies: PreviewDependencies = {}) =>
  new StoryPreview(dependencies);
