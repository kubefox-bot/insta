import { expect, test } from "bun:test";
import { observeStoryPlaying } from "../../../apps/fe-insta/src/domains/stories/components/StoryPlayer/lib/observe-playing";

test("only actual active visible playing records with current consent; preload, hidden, revoked and disposed states do not", () => {
  const media = Object.assign(new EventTarget(), {
    paused: true,
    ended: false,
    readyState: 0,
  });
  const visibility = new EventTarget();
  const state = { visible: true, consent: false, goals: 0 };
  const release = observeStoryPlaying({
    media,
    visibility,
    visible: () => state.visible,
    record: () => {
      if (!state.consent) return false;
      state.goals++;
      return true;
    },
  });
  media.dispatchEvent(new Event("loadeddata"));
  expect(state.goals).toBe(0);
  media.paused = false;
  media.readyState = 2;
  media.dispatchEvent(new Event("playing"));
  expect(state.goals).toBe(0);
  state.consent = true;
  state.visible = false;
  media.dispatchEvent(new Event("playing"));
  expect(state.goals).toBe(0);
  state.visible = true;
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(state.goals).toBe(1);
  media.dispatchEvent(new Event("playing"));
  expect(state.goals).toBe(1);
  release();
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(state.goals).toBe(1);
});

test("visibility without playing, or while buffering after hidden playing, cannot create a goal", () => {
  const media = Object.assign(new EventTarget(), {
    paused: false,
    ended: false,
    readyState: 2,
  });
  const visibility = new EventTarget();
  const state = { visible: true, goals: 0 };
  const release = observeStoryPlaying({
    media,
    visibility,
    visible: () => state.visible,
    record: () => {
      state.goals++;
      return true;
    },
  });
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(state.goals).toBe(0);
  state.visible = false;
  media.dispatchEvent(new Event("playing"));
  media.dispatchEvent(new Event("waiting"));
  state.visible = true;
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(state.goals).toBe(0);
  media.dispatchEvent(new Event("playing"));
  expect(state.goals).toBe(1);
  release();
});
