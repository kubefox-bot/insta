import { playbackGoal } from "./conts";
/** Разрешает цель наблюдения только при совпадении операции, кода и источника подтверждения воспроизведения. */
export const readStoryPlaybackGoal = (
  observation: Readonly<{ operation: string; code: string; authority: string }>,
) =>
  observation.operation === playbackGoal.operation &&
  observation.code === playbackGoal.code &&
  observation.authority === playbackGoal.authority
    ? playbackGoal.goal
    : undefined;
