import { expect, test } from "bun:test";
import { observeStoryHorizon } from "../../../apps/fe-insta/src/domains/stories/components/StoryPlayer/lib/observe-horizon";

const setup = () => {
  const calls = {
    pause: 0,
    load: 0,
    removed: 0,
    next: 0,
    prepared: 0,
    failed: 0,
  };
  const media = Object.assign(new EventTarget(), {
    currentTime: 0,
    duration: Number.POSITIVE_INFINITY,
    paused: false,
    ended: false,
    pause: () => {
      calls.pause++;
      media.paused = true;
    },
    load: () => {
      calls.load++;
    },
    removeAttribute: (name: string) => {
      if (name === "src") calls.removed++;
    },
  });
  const timers = new Map<number, () => void>();
  let sequence = 0;
  const progress: number[] = [];
  const selection = { current: true };
  const operation = observeStoryHorizon({
    media,
    durationMs: 1200,
    isCurrent: () => selection.current,
    onProgress: (fraction) => progress.push(fraction),
    onEnded: () => {
      calls.next++;
    },
    onPrepared: () => {
      calls.prepared++;
    },
    onError: () => {
      calls.failed++;
    },
    timers: {
      setTimeout: (callback) => {
        const id = ++sequence;
        timers.set(id, callback);
        return id;
      },
      clearTimeout: (timer) => {
        if (typeof timer === "number") timers.delete(timer);
      },
    },
  });
  const tick = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const callback of pending) callback();
  };
  return { calls, media, timers, progress, selection, operation, tick };
};

test("verified horizon controls progress despite infinite browser duration and releases before one advance", () => {
  const f = setup();
  f.media.currentTime = 0.6;
  f.media.dispatchEvent(new Event("timeupdate"));
  expect(f.progress.at(-1)).toBe(0.5);
  f.media.currentTime = 1.3;
  f.media.dispatchEvent(new Event("timeupdate"));
  expect(f.progress.at(-1)).toBe(1);
  expect(f.calls).toMatchObject({ pause: 1, load: 1, removed: 1, next: 1 });
  f.media.dispatchEvent(new Event("ended"));
  f.media.dispatchEvent(new Event("loadeddata"));
  f.media.dispatchEvent(new Event("error"));
  f.tick();
  expect(f.calls).toMatchObject({ next: 1, prepared: 0, failed: 0 });
  expect(f.timers.size).toBe(0);
  f.operation.dispose();
  expect(f.calls.pause).toBe(1);
});

test("polling observes horizon without timeupdate while buffering never advances on wall time alone", () => {
  const f = setup();
  f.media.dispatchEvent(new Event("playing"));
  f.tick();
  f.tick();
  expect(f.calls.next).toBe(0);
  f.media.currentTime = 1.2;
  f.tick();
  expect(f.calls.next).toBe(1);
  expect(f.timers.size).toBe(0);
});

test("selection change fences late events and timer before UI teardown; disposal releases listeners and media", () => {
  const f = setup();
  f.media.dispatchEvent(new Event("playing"));
  const lateTimer = [...f.timers.values()][0];
  f.selection.current = false;
  f.media.currentTime = 2;
  f.media.dispatchEvent(new Event("timeupdate"));
  f.media.dispatchEvent(new Event("ended"));
  f.media.dispatchEvent(new Event("loadeddata"));
  f.media.dispatchEvent(new Event("error"));
  lateTimer?.();
  expect(f.calls).toMatchObject({
    next: 0,
    prepared: 0,
    failed: 0,
    pause: 1,
    load: 1,
  });
  const before = f.progress.length;
  f.operation.dispose();
  f.media.dispatchEvent(new Event("timeupdate"));
  expect(f.progress.length).toBe(before);
  expect(f.timers.size).toBe(0);
});

test("natural ended precedes horizon once and error releases activity without advancing", () => {
  const natural = setup();
  natural.media.dispatchEvent(new Event("loadeddata"));
  natural.media.dispatchEvent(new Event("ended"));
  natural.media.dispatchEvent(new Event("ended"));
  expect(natural.calls).toMatchObject({ next: 1, prepared: 1, pause: 1 });
  const failed = setup();
  failed.media.dispatchEvent(new Event("playing"));
  failed.media.dispatchEvent(new Event("error"));
  failed.media.dispatchEvent(new Event("ended"));
  expect(failed.calls).toMatchObject({ failed: 1, next: 0, pause: 1 });
  expect(failed.timers.size).toBe(0);
});
