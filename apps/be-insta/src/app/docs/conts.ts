export const apiTitle = "Insta API";
export const apiVersion = "1";
export const openApiVersion = "3.1.0";
export const documentationPath = "/docs";
export const documentationJsonPath = "/docs/openapi.json";
export const documentationApiPath = "/docs/api";
export const documentationEntryAliases = {
  slash: "/docs/",
  index: "/docs/index.html",
} as const;
export const documentationEntryMethods = ["GET", "HEAD"] as const;
export const documentationUiOptions = {
  validatorUrl: null,
  persistAuthorization: false,
} as const;
export const documentationPaths = [
  documentationPath,
  documentationEntryAliases.slash,
  documentationEntryAliases.index,
  documentationJsonPath,
  "/docs/swagger-ui-init.js",
  "/docs/swagger-ui-bundle.js",
  "/docs/swagger-ui-standalone-preset.js",
  "/docs/swagger-ui.css",
  "/docs/favicon-16x16.png",
  "/docs/favicon-32x32.png",
] as const;
