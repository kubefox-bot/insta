export type IsoBox = Readonly<{
  type: string;
  start: number;
  data: number;
  end: number;
  children: readonly IsoBox[];
}>;
export type IsoSample = Readonly<{
  trackId: number;
  start: number;
  size: number;
  duration: number;
  timestamp: number;
}>;
export type FragmentDefaults = Readonly<{
  trackId: number;
  base: number;
  duration: number;
  size: number;
}>;
