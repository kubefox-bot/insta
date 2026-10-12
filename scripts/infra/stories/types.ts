export type StoriesPreparedService = Readonly<{
  image: string;
  environment: Readonly<Record<string, string>>;
  user?: string;
  volumes?: readonly string[];
}>;
export type StoriesPreparedServices = Readonly<
  Record<
    "be-insta" | "fe-insta" | "testhost" | "rustfs",
    StoriesPreparedService
  >
>;
