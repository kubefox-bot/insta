export type Element = Readonly<{
  id: number;
  start: number;
  sizeStart: number;
  dataStart: number;
  end: number;
  unknown: boolean;
}>;
export type InfoLayout = Readonly<{
  element: Element;
  children: readonly Element[];
  duration: Readonly<{ element: Element; value: number }> | undefined;
}>;
export type WebmLayout = Readonly<{
  segment: Element;
  info: InfoLayout;
  indexed: boolean;
}>;
