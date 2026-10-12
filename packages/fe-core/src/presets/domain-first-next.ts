export const domainFirstNextPreset = {
  disallowedExternalImports: ["oxide.ts", "oxide.ts/core"],
  exportCountAllowlist: [
    "index.ts",
    "index.tsx",
    "types.ts",
    "consts.ts",
    "conts.ts",
    "localize.ts",
    "page.tsx",
    "layout.tsx",
    "route.ts",
    "error.tsx",
    "loading.tsx",
    "not-found.tsx",
  ],
  maxRuntimeExports: 3,
  resultBoundary: "src/core/toolings/result",
} as const;
