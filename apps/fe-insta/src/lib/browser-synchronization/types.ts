export type ChannelOptions = Readonly<{
  name: string;
  onMessage: (data: unknown) => void;
  onFocus: () => void;
}>;
export type BrowserChannel = Readonly<{
  publish: (notice: unknown) => void;
  close: () => void;
}>;
