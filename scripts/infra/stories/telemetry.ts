import type { StoriesPreparedServices } from "./types";
/** Создаёт defaults с пустыми telemetry URLs и optional профиль с локальным receiver на testhost image, пользователем bun и без mounts. Сохраняет остальные service settings, включая Stories mode; контейнеры не запускает, исходные вложенные значения могут разделяться. */
export const createStoriesTelemetryProfiles = (
  services: StoriesPreparedServices,
) => {
  const defaults = {
    services: {
      "be-insta": {
        ...services["be-insta"],
        environment: {
          ...services["be-insta"].environment,
          ...Object.fromEntries([["OTEL_RECEIVER_URL", ""]]),
        },
      },
      "fe-insta": {
        ...services["fe-insta"],
        environment: {
          ...services["fe-insta"].environment,
          ...Object.fromEntries([["FARO_RECEIVER_URL", ""]]),
        },
      },
      testhost: services.testhost,
      rustfs: services.rustfs,
    },
  };
  return {
    defaults,
    optional: {
      services: {
        ...defaults.services,
        "be-insta": {
          ...services["be-insta"],
          environment: {
            ...services["be-insta"].environment,
            ...Object.fromEntries([
              ["OTEL_RECEIVER_URL", "http://telemetry-receiver:4318/v1/traces"],
            ]),
          },
        },
        "fe-insta": {
          ...services["fe-insta"],
          environment: {
            ...services["fe-insta"].environment,
            ...Object.fromEntries([
              ["FARO_RECEIVER_URL", "http://telemetry-receiver:4318/collect"],
            ]),
          },
        },
        "telemetry-receiver": {
          image: services.testhost.image,
          user: "bun",
          ...Object.fromEntries([["working_dir", "/workspace"]]),
          volumes: [],
        },
      },
    },
  };
};
