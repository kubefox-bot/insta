export const CSS_CONFIGURATION = {
  transformer: "lightningcss",
  lightningcss: { cssModules: { pattern: "[name]_[local]_[hash]" } },
} as const;

export const BUILD_CONFIGURATION = { cssMinify: "lightningcss" } as const;

export const SSR_BUILD_CONFIGURATION = {
  // Bun loads the TS public entrypoint; Vite's automatic externalization only
  // accepts JS. Keep this stateful owner shared with the external preload.
  rolldownOptions: { external: ["@insta/fe-core/observability/server"] },
};

export const SSR_CONFIGURATION = {
  // Stateful server owners must remain one Bun-loaded module across SSR and preload.
  external: ["pino", "@insta/fe-core/observability/server"],
  noExternal: [
    "bits-ui",
    "runed",
    "svelte-toolbelt",
    "@insta/contracts",
    "@insta/ui-kit",
    "@insta/fe-core",
    "pino",
  ],
};
