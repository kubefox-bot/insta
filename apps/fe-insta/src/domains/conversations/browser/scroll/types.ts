export type ScrollSnapshot = Readonly<{
  topPx: number;
  nearBottom: boolean;
  unread: boolean;
  anchor: Readonly<{ id: string; offsetPx: number }> | null;
}>;
export type ScrollBinding = Readonly<{
  read: () => ScrollSnapshot | null;
  capture: (snapshot: ScrollSnapshot) => void;
}>;
