import { storiesInfra } from "./conts";

/** Подставляет origin текущего локального HTTPS в сгенерированный профиль RustFS; внешние профили и остальные поля сохраняет. */
export const withLocalPlaybackOrigin = <
  Profile extends Readonly<{
    id: string;
    endpoint: string;
    playbackEndpoint: string;
  }>,
>(
  profiles: readonly Profile[],
  origin: string,
) =>
  profiles.map((profile) =>
    profile.id === storiesInfra.profile &&
    profile.endpoint === storiesInfra.endpoint
      ? { ...profile, playbackEndpoint: origin }
      : profile,
  );
