export type PreviewActor = Readonly<{ userId: string; generation: string }>;
export type PreviewResource = Readonly<{
  actor: PreviewActor;
  previewId: string;
  blob: Blob;
  url?: string;
}>;
export type PreviewDependencies = Readonly<{
  uuid?: () => string;
  urls?: Readonly<{
    create: (blob: Blob) => string;
    revoke: (url: string) => void;
  }>;
}>;
