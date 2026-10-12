export type PublicationFeedDependencies = Readonly<{
  invalidate: () => Promise<void>;
  onDeferred: () => void;
  clock?: () => number;
  after?: (callback: () => void, timeoutMs: number) => () => void;
}>;
