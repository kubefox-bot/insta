export type HttpClientDefinition = Readonly<{
  directCallable: boolean;
  methods: ReadonlySet<string>;
}>;
