// Only request-producing exports are bindings. Helpers such as
// axios.isAxiosError() must not be mistaken for a network call.
export const httpClientCatalog = [
  [
    "axios",
    {
      directCallable: true,
      methods: [
        "delete",
        "get",
        "head",
        "options",
        "patch",
        "patchForm",
        "post",
        "postForm",
        "put",
        "putForm",
        "request",
      ],
    },
  ],
  [
    "got",
    {
      directCallable: true,
      methods: ["delete", "get", "head", "patch", "post", "put", "stream"],
    },
  ],
  [
    "ky",
    {
      directCallable: true,
      methods: ["delete", "get", "head", "patch", "post", "put"],
    },
  ],
  ["node-fetch", { directCallable: true, methods: [] }],
  [
    "ofetch",
    { directCallable: true, methods: ["$fetch", "createFetch", "ofetch"] },
  ],
  [
    "superagent",
    {
      directCallable: true,
      methods: ["delete", "get", "head", "options", "patch", "post", "put"],
    },
  ],
  [
    "undici",
    {
      directCallable: false,
      methods: ["connect", "fetch", "pipeline", "request", "stream", "upgrade"],
    },
  ],
  ["wretch", { directCallable: true, methods: [] }],
] as const;
