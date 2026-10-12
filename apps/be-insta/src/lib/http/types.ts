export type NativeResponse = Readonly<{
  status: (value: number) => unknown;
  setHeader: (key: string, value: string) => unknown;
}>;

export type SwaggerBodySchema = Extract<
  Parameters<typeof import("@nestjs/swagger").ApiBody>[0],
  { schema: unknown }
>["schema"];
